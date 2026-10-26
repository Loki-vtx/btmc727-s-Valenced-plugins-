import { instead } from '@valenced/patcher'
import { store } from '../env'
import { getSettings } from '../settings'
import type { ReadAllApi } from '../settings'

// ReadStateStore hands out per-channel ReadState objects; `ack` lives on their
// prototype. While "hold unread" is on, Discord's automatic acks are swallowed.
// Our own acks go through BULK_ACK, so they're unaffected.
export default function holdUnread({ cleanup }: ReadAllApi) {
	let installed = false
	let timer: ReturnType<typeof setInterval> | undefined

	const sample = () => {
		const { ReadStateStore, SelectedChannelStore, ChannelStore } = {
			ReadStateStore: store('ReadStateStore'),
			SelectedChannelStore: store('SelectedChannelStore'),
			ChannelStore: store('ChannelStore'),
		}
		if (typeof ReadStateStore?.getForDebugging !== 'function') return
		const ids: string[] = []
		const sel = SelectedChannelStore?.getChannelId?.()
		if (sel) ids.push(sel)
		const dms = ChannelStore?.getPrivateChannelIds?.()
		if (dms) ids.push(...(Array.isArray(dms) ? dms : Object.values<string>(dms)).slice(0, 20))
		for (const id of ids) {
			try {
				const rs = ReadStateStore.getForDebugging(id)
				if (rs && typeof rs.ack === 'function') return rs
			} catch {}
		}
	}

	const tryInstall = () => {
		if (installed) return true
		const rs = sample()
		if (!rs) return false
		let proto = Object.getPrototypeOf(rs)
		while (proto && !Object.prototype.hasOwnProperty.call(proto, 'ack'))
			proto = Object.getPrototypeOf(proto)
		if (!proto || typeof proto.ack !== 'function') return true // nothing to patch

		cleanup(
			instead(proto, 'ack', function (args: any[], orig: (...a: any[]) => any) {
				const opts = args[0]
				if (getSettings().holdUnread && !opts?.force && !opts?.local) return false
				return Reflect.apply(orig, this, args)
			}),
		)
		return (installed = true)
	}

	// ReadState objects may not exist yet at startup, so retry until one does.
	if (!tryInstall()) {
		timer = setInterval(() => {
			if (tryInstall() && timer) {
				clearInterval(timer)
				timer = undefined
			}
		}, 1000)
		cleanup(() => timer && clearInterval(timer))
	}
}
