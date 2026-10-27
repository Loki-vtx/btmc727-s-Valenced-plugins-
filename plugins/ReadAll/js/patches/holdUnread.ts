import { instead } from '@valenced/patcher'
import { store } from '../env'
import { getSettings } from '../settings'
import type { ReadAllApi } from '../settings'

const MAX_TRIES = 60 // so the svj wouldnt stay in an infinte loop

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

	// ReadState objects may not exist yet at startup, so retry for a while.
	if (!tryInstall()) {
		let tries = 0
		const stop = () => {
			if (timer) clearInterval(timer)
			timer = undefined
		}
		timer = setInterval(() => {
			tries++
			if (tryInstall()) return stop()
			if (tries >= MAX_TRIES) {
				stop()
				console.warn('[ReadAll+] hold-unread: no ReadState found, giving up')
			}
		}, 1000)
		cleanup(stop)
	}
}
