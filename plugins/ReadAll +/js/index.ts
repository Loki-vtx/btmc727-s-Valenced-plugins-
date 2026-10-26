import { getErrorStack } from '@valenced/utils/error'
import chatPill from './patches/chatPill'
import command from './patches/command'
import holdUnread from './patches/holdUnread'
import serverMenu from './patches/serverMenu'
import { SettingsComponent } from './SettingsComponent'
import { bindApi, DEFAULTS } from './settings'
import type { ApiOptions, ReadAllApi } from './settings'

export type { ApiOptions } from './settings'

export default plugin<ApiOptions>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start(api: ReadAllApi) {
		bindApi(api)

		for (const patches of [command, serverMenu, chatPill, holdUnread])
			try {
				patches(api)
			} catch (e) {
				api.plugin.reportError(`Failed to apply patches for ${patches.name}: ${getErrorStack(e)}`)
			}
	},
	SettingsComponent,
})
