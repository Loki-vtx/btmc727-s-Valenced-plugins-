import { after } from '@valenced/patcher'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import React from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { store, toast } from '../env'
import { channelHasUnread, markChannelRead } from '../readState'
import { getSettings } from '../settings'
import type { ReadAllApi } from '../settings'

const GAP = 8
const TYPING_OFFSET = 26
const FADE_DELAY = 1200
const FADE_MS = 1500
const KEY = 'read-all'

function useUnreadChannel() {
	const read = () => {
		const selected = store('SelectedChannelStore')?.getChannelId?.() as string | undefined
		return { selected, unread: selected && channelHasUnread(selected) ? selected : undefined }
	}
	const [state, setState] = React.useState(read)

	React.useEffect(() => {
		const stores = [store('ReadStateStore'), store('SelectedChannelStore')].filter(s => s?.addChangeListener)
		let t: ReturnType<typeof setTimeout> | undefined
		const onChange = () => {
			t ??= setTimeout(() => {
				t = undefined
				const next = read()
				setState(p => (p.selected === next.selected && p.unread === next.unread ? p : next))
			}, 200)
		}
		for (const s of stores) s.addChangeListener(onChange)
		onChange()
		return () => {
			if (t) clearTimeout(t)
			for (const s of stores) s.removeChangeListener(onChange)
		}
	}, [])

	return state
}

function Label({ compact, done, pressed, fontSize }: { compact: boolean; done: boolean; pressed: boolean; fontSize: number }) {
	const lh = Math.round(fontSize * 1.34)
	return (
		<View
			style={{
				minWidth: 32,
				minHeight: lh + 12,
				paddingHorizontal: 8,
				paddingVertical: 4,
				borderRadius: 8,
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: '#222327',
				elevation: done ? 0 : 4,
				opacity: pressed ? 0.7 : 1,
			}}
		>
			<Text
				numberOfLines={1}
				style={{
					fontSize,
					lineHeight: lh,
					fontWeight: '600',
					color: done ? '#23A55A' : '#F23F43',
				}}
			>
				{done ? (compact ? '✓' : 'Marked as read') : compact ? '✓' : '✓ Mark as read'}
			</Text>
		</View>
	)
}

function ReadPill({ api, typing }: { api: ReadAllApi; typing: boolean }) {
	api.jsonStorage.use() // re-render when settings change
	const { selected, unread } = useUnreadChannel()
	const settings = getSettings()
	const [shown, setShown] = React.useState<string | undefined>(unread)
	const [done, setDone] = React.useState(false)
	const opacity = React.useRef(new Animated.Value(1)).current
	const always = React.useRef(settings.alwaysShow)
	always.current = settings.alwaysShow

	const fadeOut = React.useCallback(() => {
		setDone(true)
		if (always.current) return
		Animated.timing(opacity, { toValue: 0, delay: FADE_DELAY, duration: FADE_MS, useNativeDriver: true }).start(
			({ finished }) => {
				if (finished) {
					setShown(undefined)
					setDone(false)
				}
			},
		)
	}, [opacity])

	React.useEffect(() => {
		if (unread) {
			opacity.stopAnimation()
			opacity.setValue(1)
			setDone(false)
			setShown(unread)
		} else if (settings.alwaysShow && selected) {
			opacity.stopAnimation()
			opacity.setValue(1)
			setDone(true)
			setShown(selected)
		} else if (shown && shown === selected) {
			if (!done || !settings.alwaysShow) fadeOut()
		} else if (shown) {
			opacity.stopAnimation()
			setDone(false)
			setShown(undefined)
		}
	}, [selected, unread, settings.alwaysShow])

	if (!shown) return null

	return (
		<Animated.View
			pointerEvents={done ? 'none' : 'box-none'}
			style={{
				position: 'absolute',
				bottom: '100%',
				marginBottom: GAP + (typing && !settings.compact ? TYPING_OFFSET : 0),
				[settings.side]: 16,
				opacity,
			}}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={done ? 'This chat is marked as read' : 'Mark this chat as read'}
				disabled={done}
				onPress={() => {
					// Marks only the open chat. The store listener above fades the pill out once Discord confirms it.
					try {
						if (!selected || !markChannelRead(selected)) throw new Error('Channel not in ReadState stores')
						setTimeout(() => {
							if (channelHasUnread(selected)) toast("Discord didn't clear this chat", 'ReadAllChat')
						}, 500)
					} catch (e) {
						api.plugin.reportError(e)
						toast("Couldn't mark this chat as read", 'ReadAllChat')
					}
				}}
			>
				{({ pressed }) => <Label compact={settings.compact} done={done} pressed={pressed} fontSize={settings.fontSize} />}
			</Pressable>
		</Animated.View>
	)
}

// --- locating the spots inside ChatInput's render tree ----------------------

// The container we append to: collapsable={false}, has onLayout.
const isInputContainer = (n: any) => n?.props?.collapsable === false && typeof n.props.onLayout === 'function'

// The "someone is typing" overlay: absolute, full-height, coloured, childless.
const isTypingOverlay = (n: any) => {
	const p = n?.props
	if (!p || p.pointerEvents !== 'none' || p.children != null || !p.style) return false
	const s = StyleSheet.flatten(p.style) ?? {}
	return s.position === 'absolute' && s.top === 0 && s.bottom === 0 && s.backgroundColor != null
}

const toKids = (c: any): any[] => (Array.isArray(c) ? c : c == null || c === false ? [] : [c])

/**
 * Returns a new tree with the pill added to the input container.
 * Never mutates props: React freezes them in dev builds, and a mutation there
 * throws and the pill silently disappears. Unchanged branches are returned as-is.
 */
const withPill = (node: any, api: ReadAllApi, depth = 0): any => {
	if (!node || typeof node !== 'object' || depth > 60) return node

	if (Array.isArray(node)) {
		let changed = false
		const out = node.map(n => {
			const r = withPill(n, api, depth + 1)
			if (r !== n) changed = true
			return r
		})
		return changed ? out : node
	}

	const p = node.props
	if (!p) return node

	if (isInputContainer(node)) {
		const kids = toKids(p.children)
		if (kids.some((c: any) => c?.key === KEY)) return node
		const typing = kids.some(isTypingOverlay)
		return React.cloneElement(node, undefined, ...kids, <ReadPill key={KEY} api={api} typing={typing} />)
	}

	if (p.children == null) return node
	const kids = withPill(p.children, api, depth + 1)
	return kids === p.children ? node : React.cloneElement(node, undefined, kids)
}

export default function chatPill(api: ReadAllApi) {
	const { cleanup, plugin } = api
	cleanup(
		getModules(
			withName('ChatInput'),
			(mod: any) => {
				// Revenge-style: default export is a forwardRef/memo wrapping { render }.
				let target = mod?.default ?? mod
				for (let i = 0; i < 3 && target && typeof target.render !== 'function'; i++) target = target.type
				if (typeof target?.render !== 'function') return plugin.reportError(new Error('ChatInput has no render to patch'))

				cleanup(
					after(target, 'render', (tree: any) => {
						try {
							if (!getSettings().chatPill) return tree
							return withPill(tree, api)
						} catch (e) {
							plugin.reportError(e)
							return tree
						}
					}),
				)
			},
			{ returnNamespace: true },
		),
	)
}
