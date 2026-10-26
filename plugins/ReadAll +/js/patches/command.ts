import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { markAllRead } from '../readState'
import type { ReadAllApi } from '../settings'

const nextId = (cmds: any[]) => {
	const used = new Set(cmds.map(c => c?.id).filter(Boolean))
	let n = 1
	while (used.has(String(n))) n++
	return String(n)
}

export default function command({ cleanup }: ReadAllApi) {
	let cmd: any
	cleanup(
		getModules(withProps('getBuiltInCommands'), (mod: any) => {
			cleanup(
				after(mod, 'getBuiltInCommands', (cmds: any) => {
					if (!Array.isArray(cmds)) return cmds
					cmd ??= {
						name: 'readall',
						description: 'Mark all servers and DMs as read',
						async execute() {
							markAllRead()
						},
					}
					cmd.id ??= nextId(cmds)
					return cmds.some(c => c?.id === cmd.id) ? cmds : [...cmds, cmd]
				}),
			)
		}),
	)
}
