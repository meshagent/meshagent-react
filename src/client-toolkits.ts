import { useEffect, useRef } from "react";
import { RoomClient, startHostedToolkit, Toolkit } from "@meshagent/meshagent";

interface ClientToolkitsProps {
	room: RoomClient;
	toolkits: Toolkit[];
	public?: boolean;
}

type HostedToolkitHandle = Awaited<ReturnType<typeof startHostedToolkit>>;

interface SharedHostedToolkitEntry {
	definition: string;
	refs: number;
	startedToolkit: Promise<HostedToolkitHandle>;
	stopPromise: Promise<void> | null;
}

interface HostedToolkitLease {
	release(): Promise<void>;
}

const sharedHostedToolkits = new WeakMap<
	RoomClient,
	Map<string, SharedHostedToolkitEntry>
>();

function getToolkitDefinition(toolkit: Toolkit, isPublic: boolean): string {
	return JSON.stringify({
		public: isPublic,
		name: toolkit.name,
		title: toolkit.title,
		description: toolkit.description,
		thumbnailUrl: toolkit.thumbnailUrl ?? null,
		rules: [...toolkit.rules],
		tools: toolkit.tools.map((tool) => ({
			name: tool.name,
			title: tool.title,
			description: tool.description,
			inputSpec: tool.inputSpec?.toJson() ?? null,
			outputSpec: tool.outputSpec?.toJson() ?? null,
			thumbnailUrl: tool.thumbnailUrl ?? null,
		})),
	});
}

function getOrCreateSharedRoomToolkits(
	room: RoomClient,
): Map<string, SharedHostedToolkitEntry> {
	const existing = sharedHostedToolkits.get(room);
	if (existing !== undefined) {
		return existing;
	}

	const created = new Map<string, SharedHostedToolkitEntry>();
	sharedHostedToolkits.set(room, created);
	return created;
}

async function releaseHostedToolkitLease(
	room: RoomClient,
	toolkitName: string,
	entry: SharedHostedToolkitEntry,
): Promise<void> {
	const roomToolkits = sharedHostedToolkits.get(room);
	if (roomToolkits?.get(toolkitName) !== entry || entry.refs === 0) {
		return;
	}

	entry.refs -= 1;
	if (entry.refs > 0) {
		return;
	}
	if (entry.stopPromise !== null) {
		await entry.stopPromise;
		return;
	}

	entry.stopPromise = (async () => {
		try {
			const hostedToolkit = await entry.startedToolkit;
			await hostedToolkit.stop();
		} finally {
			const latestRoomToolkits = sharedHostedToolkits.get(room);
			if (latestRoomToolkits?.get(toolkitName) === entry) {
				latestRoomToolkits.delete(toolkitName);
				if (latestRoomToolkits.size === 0) {
					sharedHostedToolkits.delete(room);
				}
			}
			entry.stopPromise = null;
		}
	})();

	await entry.stopPromise;
}

async function acquireHostedToolkitLease({
	room,
	toolkit,
	public_: isPublic,
}: {
	room: RoomClient;
	toolkit: Toolkit;
	public_: boolean;
}): Promise<HostedToolkitLease> {
	const definition = getToolkitDefinition(toolkit, isPublic);

	while (true) {
		const roomToolkits = getOrCreateSharedRoomToolkits(room);
		const existing = roomToolkits.get(toolkit.name);

		if (existing === undefined) {
			const entry: SharedHostedToolkitEntry = {
				definition,
				refs: 1,
				startedToolkit: startHostedToolkit({
					room,
					toolkit,
					public_: isPublic,
				}),
				stopPromise: null,
			};
			roomToolkits.set(toolkit.name, entry);

			try {
				await entry.startedToolkit;
			} catch (error) {
				if (roomToolkits.get(toolkit.name) === entry) {
					roomToolkits.delete(toolkit.name);
					if (roomToolkits.size === 0) {
						sharedHostedToolkits.delete(room);
					}
				}
				throw error;
			}

			return {
				release: () => releaseHostedToolkitLease(room, toolkit.name, entry),
			};
		}

		if (existing.stopPromise !== null) {
			await existing.stopPromise;
			continue;
		}

		if (existing.definition !== definition) {
			throw new Error(
				`toolkit '${toolkit.name}' is already hosted for this room with a different definition`,
			);
		}

		existing.refs += 1;

		try {
			await existing.startedToolkit;
		} catch (error) {
			existing.refs -= 1;
			if (existing.refs === 0 && roomToolkits.get(toolkit.name) === existing) {
				roomToolkits.delete(toolkit.name);
				if (roomToolkits.size === 0) {
					sharedHostedToolkits.delete(room);
				}
			}
			throw error;
		}

		return {
			release: () => releaseHostedToolkitLease(room, toolkit.name, existing),
		};
	}
}

export const useClientToolkits = ({
	room,
	toolkits,
	public: isPublic = false,
}: ClientToolkitsProps) => {
	const cleanupRef = useRef<Promise<void>>(Promise.resolve());

	useEffect(() => {
		let disposed = false;
		const toolkitLeases: HostedToolkitLease[] = [];
		const waitForPreviousCleanup = cleanupRef.current;

		const startPromise = (async () => {
			await waitForPreviousCleanup;

			try {
				for (const toolkit of toolkits) {
					if (disposed) {
						return;
					}

					const lease = await acquireHostedToolkitLease({
						room,
						toolkit,
						public_: isPublic,
					});
					if (disposed) {
						await lease.release();
						return;
					}
					toolkitLeases.push(lease);
				}
			} catch (error) {
				const leasesToRelease = toolkitLeases.splice(0);
				await Promise.all(leasesToRelease.map((lease) => lease.release()));
				if (!disposed) {
					console.error("unable to start client toolkits", error);
				}
			}
		})();

		return () => {
			disposed = true;
			cleanupRef.current = (async () => {
				await startPromise;
				const leasesToRelease = toolkitLeases.splice(0);
				await Promise.all(leasesToRelease.map((lease) => lease.release()));
			})().catch((error) => {
				console.error("unable to stop client toolkits", error);
			});
		};
	}, [room, toolkits, isPublic]);
};
