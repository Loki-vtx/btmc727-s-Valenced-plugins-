import { dispatcher, store, toArray } from './env'
import { getSettings } from './settings'

const BATCH = 100

interface Ack {
	channelId: string
	messageId: string | null
	readStateType: 0
}

const hasUnread = (id: string) => !!store('ReadStateStore')?.hasUnread?.(id)

function ackFor(id: string): Ack {
	return {
		channelId: id,
		messageId: store('ReadStateStore')?.lastMessageId?.(id) ?? null,
		readStateType: 0,
	}
}

function send(acks: Ack[]) {
	const d = dispatcher()
	if (!d) throw new Error('Dispatcher not found')
	for (let i = 0; i < acks.length; i += BATCH)
		d.dispatch({
			type: 'BULK_ACK',
			context: 'APP',
			channels: acks.slice(i, i + BATCH),
		})
}

export function channelHasUnread(id: string) {
	try {
		return hasUnread(id)
	} catch {
		return false
	}
}

export function markChannelRead(id: string) {
	if (!dispatcher() || !store('ReadStateStore')) return false
	send([ackFor(id)])
	return true
}

/** Mark DMs and/or servers read. `guildId` limits it to one server and ignores exclusions. */
export function markAllRead(scope: 'all' | 'dms' | 'servers' = 'all', guildId?: string) {
	const { excludedServers, excludedDMs } = getSettings()
	const skipServers = new Set(excludedServers)
	const skipDMs = new Set(excludedDMs)
	const result = { dms: 0, channels: 0, skipped: 0 }

	const ReadState = store('ReadStateStore')
	const Channels = store('ChannelStore')
	const Guilds = store('GuildStore')
	const GuildChannels = store('GuildChannelStore')
	const Threads = store('ActiveJoinedThreadsStore')
	if (!ReadState) throw new Error('ReadStateStore is missing')

	const acks: Ack[] = []
	const seen = new Set<string>()
	const add = (id: string | undefined, kind: 'dms' | 'channels') => {
		if (!id || seen.has(id)) return
		seen.add(id)
		if (!hasUnread(id)) return
		acks.push(ackFor(id))
		result[kind]++
	}

	if (scope !== 'servers' && !guildId)
		for (const id of toArray<string>(Channels?.getPrivateChannelIds?.()))
			skipDMs.has(id) ? result.skipped++ : add(id, 'dms')

	const guildIds = guildId
		? [guildId]
		: scope === 'dms'
			? []
			: toArray<string>(
					Guilds?.getGuildIds?.() ?? Object.keys(Guilds?.getGuilds?.() ?? {}),
				)

	for (const gid of guildIds) {
		if (!guildId && skipServers.has(gid)) {
			result.skipped++
			continue
		}
		const chans = GuildChannels?.getChannels?.(gid)
		for (const type of ['SELECTABLE', 'VOCAL'])
			for (const c of toArray<any>(chans?.[type])) add(c?.channel?.id ?? c?.id, 'channels')
		for (const group of toArray<any>(Threads?.getActiveJoinedThreadsForGuild?.(gid) ?? {}))
			for (const t of toArray<any>(group)) add(t?.channel?.id ?? t?.id, 'channels')
	}

	send(acks)
	console.log(
		`[ReadAll+] Cleared ${result.dms} DMs, ${result.channels} channels. Skipped ${result.skipped}.`,
	)
	return result
}
