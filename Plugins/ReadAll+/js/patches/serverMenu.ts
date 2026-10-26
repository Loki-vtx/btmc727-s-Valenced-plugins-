import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'
import { toast } from '../env'
import { markAllRead } from '../readState'
import { getSettings } from '../settings'
import type { ReadAllApi } from '../settings'

const FN = 'getGuildsBarGuildMenuItems'

export default function serverMenu({ cleanup, plugin }: ReadAllApi) {
	cleanup(
		getModules(
			withName(FN),
			(mod: any) => {
				const key = typeof mod?.[FN] === 'function' ? FN : typeof mod?.default === 'function' ? 'default' : undefined
				if (!key) return plugin.reportError(new Error('Server menu module has no function to hook'))

				let guildId: string | undefined
				cleanup(
					before(mod, key, (args: any[]) => {
						guildId = typeof args[0] === 'string' ? args[0] : (args[0]?.guildId ?? args[0]?.id)
						return args
					}),
				)
				cleanup(
					after(mod, key, (items: any) => {
						try {
							const id = guildId
							if (!getSettings().serverMenu || !id || !Array.isArray(items)) return items
							// Skip if we're already in there, or Discord already offers "Mark as read".
							if (
								items.some(
									i =>
										i?.key === 'read-all' ||
										/mark\s*as\s*read/i.test(String(i?.label ?? '')),
								)
							)
								return items
							return [
								...items,
								{
									key: 'read-all',
									label: 'Mark as read',
									action: () => {
										try {
											const { channels } = markAllRead('servers', id)
											toast(channels ? `Marked ${channels} channels as read` : 'Nothing unread here', 'ReadAllServer')
										} catch (e) {
											plugin.reportError(e)
											toast("Couldn't mark this server as read", 'ReadAllServer')
										}
									},
								},
							]
						} catch (e) {
							plugin.reportError(e)
							return items
						}
					}),
				)
			},
			{ returnNamespace: true },
		),
	)
}
