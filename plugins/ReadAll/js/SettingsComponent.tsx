import React from 'react'
import { ScrollView, TouchableOpacity, Text as RNText, View } from 'react-native'
import { design, store, toast } from './env'
import { FONT, getSettings, setSettings } from './settings'
import type { ApiOptions, ReadAllApi } from './settings'
import type { PluginSettingsComponent } from '@valenced/plugins/types'

type ListKey = 'excludedServers' | 'excludedDMs'

const guildName = (id: string) => {
	const g = store('GuildStore')?.getGuild?.(id)
	return g?.name ? `${g.name} (${id})` : id
}

const channelName = (id: string) => {
	const c = store('ChannelStore')?.getChannel?.(id)
	if (c?.name) return `${c.name} (${id})`
	const u = c?.recipients?.[0] && store('UserStore')?.getUser?.(c.recipients[0])
	return u?.username ? `@${u.username} (${id})` : id
}

export const SettingsComponent: PluginSettingsComponent<ApiOptions> = ({ api }: { api: ReadAllApi }) => {
	const { TableRowGroup, TableRow, TableSwitchRow, Stack, TextInput } = design('TableRowGroup', 'TableRow', 'TableSwitchRow', 'Stack', 'TextInput')
	const { Slider } = design('TableRowGroup', 'Slider')

	api.jsonStorage.use() // re-render on change
	const s = getSettings()
	const [serverInput, setServerInput] = React.useState('')
	const [dmInput, setDmInput] = React.useState('')

	const toggle = (label: string, subLabel: string, key: keyof ApiOptions['jsonStorage'], on?: (v: boolean) => any, value?: boolean) => (
		<TableSwitchRow
			label={label}
			subLabel={subLabel}
			value={value ?? (s[key] as boolean)}
			onValueChange={(v: boolean) => setSettings(on ? on(v) : { [key]: v })}
		/>
	)

	const exclusion = (key: ListKey, title: string, listTitle: string, placeholder: string, addLabel: string, addSub: string, input: string, setInput: (v: string) => void, name: (id: string) => string) => {
		const add = () => {
			const id = input.trim()
			if (!id) return toast('Please enter an ID')
			if (s[key].includes(id)) return toast('Already excluded')
			setSettings({ [key]: [...s[key], id] })
			setInput('')
			toast('Exception added')
		}
		const remove = (id: string) => {
			setSettings({ [key]: s[key].filter(x => x !== id) })
			toast('Exception removed')
		}
		return (
			<>
				<TableRowGroup title={title}>
					<Stack spacing={4}>
						<TextInput placeholder={placeholder} value={input} onChange={setInput} isClearable onSubmitEditing={add} returnKeyType="done" />
					</Stack>
				</TableRowGroup>
				<TableRowGroup>
					<TableRow label={addLabel} subLabel={addSub} trailing={<TableRow.Arrow />} onPress={add} />
				</TableRowGroup>
				{s[key].length > 0 && (
					<TableRowGroup title={listTitle}>
						{s[key].map(id => (
							<TableRow
								key={id}
								label={name(id)}
								trailing={
									<TouchableOpacity onPress={() => remove(id)}>
										<RNText style={{ color: '#ff4d4d', fontSize: 18 }}>✕</RNText>
									</TouchableOpacity>
								}
							/>
						))}
					</TableRowGroup>
				)}
			</>
		)
	}

	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
			<Stack spacing={8}>
				<TableRowGroup title="Read All+ Info">
					<TableRow
						label="What is this?"
						subLabel="Mark a chat read from the button above the message box, a server from its long-press menu, or everything with /readall (skips the IDs below)"
					/>
				</TableRowGroup>

				<TableRowGroup title="In chats">
					{toggle('"Mark read" button', 'Floats above the message box while the open chat has unread messages. Tapping it marks this chat read', 'chatPill')}
					{toggle(
						'Keep chats unread until I tap ✓',
						'Discord stops marking chats read when you open them or scroll to the newest messages. The button, the server menu, /readall and Discord\'s own Mark as read still work',
						'holdUnread',
					)}
					{toggle('Always show the button', 'Stays in every chat: green "Marked as read" when there is nothing new, red "✓ Mark as read" when there is', 'alwaysShow')}
					{toggle('On the left', 'Above the +. Off puts it on the right', 'side', v => ({ side: v ? 'left' : 'right' }), s.side === 'left')}
					{toggle('Compact', 'Just a red ✓, which turns green once read', 'compact')}
				</TableRowGroup>

				<TableRowGroup>
					<TableRow
						label="Text size"
						subLabel={
							<View style={{ gap: 8, marginTop: 8 }}>
								<RNText style={{ color: '#949BA4', fontSize: 14 }}>
									{s.fontSize} pt{s.fontSize === FONT.default ? ' (default)' : ''}
								</RNText>
								<Slider
									step={1}
									value={s.fontSize}
									minimumValue={FONT.min}
									maximumValue={FONT.max}
									onValueChange={(v: number) => setSettings({ fontSize: Math.round(v) })}
								/>
							</View>
						}
					/>
				</TableRowGroup>

				<TableRowGroup title="Servers">
					{toggle('Mark as read in the server menu', 'Long-press a server icon to mark just that server read', 'serverMenu')}
				</TableRowGroup>

				{exclusion('excludedServers', 'Exclude Server', 'Excluded Servers', 'Enter Server ID', 'Add Server Exception', 'Prevent this server from being marked as read', serverInput, setServerInput, guildName)}
				{exclusion('excludedDMs', 'Exclude DM / Group', 'Excluded DMs', 'Enter Channel ID', 'Add DM Exception', 'Prevent this channel from being marked as read', dmInput, setDmInput, channelName)}
			</Stack>
		</ScrollView>
	)
}
