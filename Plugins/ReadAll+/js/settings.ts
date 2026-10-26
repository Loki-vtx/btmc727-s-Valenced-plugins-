import type { PluginApi } from '@valenced/plugins/types'

export interface ApiOptions {
	jsonStorage: {
		excludedServers: string[]
		excludedDMs: string[]
		chatPill: boolean
		side: 'left' | 'right'
		compact: boolean
		fontSize: number
		serverMenu: boolean
		holdUnread: boolean
		alwaysShow: boolean
	}
}

export type ReadAllApi = PluginApi<ApiOptions>

export const DEFAULTS: ApiOptions['jsonStorage'] = {
	excludedServers: [],
	excludedDMs: [],
	chatPill: true,
	side: 'left',
	compact: false,
	fontSize: 12,
	serverMenu: true,
	holdUnread: false,
	alwaysShow: false,
}

export const FONT = { min: 10, max: 20, default: 12 }

let current: ReadAllApi | undefined
export const bindApi = (api: ReadAllApi) => (current = api)

export function getSettings(raw?: Partial<ApiOptions['jsonStorage']>) {
	const s = { ...DEFAULTS, ...(raw ?? current?.jsonStorage.cache ?? {}) }
	const size = Math.round(Number(s.fontSize))
	return {
		...s,
		excludedServers: Array.isArray(s.excludedServers) ? s.excludedServers : [],
		excludedDMs: Array.isArray(s.excludedDMs) ? s.excludedDMs : [],
		side: s.side === 'right' ? ('right' as const) : ('left' as const),
		fontSize: Number.isFinite(size)
			? Math.min(FONT.max, Math.max(FONT.min, size))
			: FONT.default,
	}
}

export const setSettings = (patch: Partial<ApiOptions['jsonStorage']>) =>
	current?.jsonStorage.set(patch)
