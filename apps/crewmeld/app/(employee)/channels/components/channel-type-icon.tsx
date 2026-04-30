import Image from 'next/image'
import type { ConnectionType } from '@/lib/connectors/types'
import { CONNECTION_TYPE_ICONS } from '@/lib/connectors/types'

const IMAGE_ICONS: Partial<Record<ConnectionType, string>> = {
  wecom: '/brand/wecom.svg',
  dingtalk: '/brand/dingtalk.svg',
  feishu: '/brand/feishu.svg',
  telegram: '/brand/telegram.svg',
  discord: '/brand/discord.svg',
  wxoa: '/brand/wxoa.svg',
}

interface ChannelTypeIconProps {
  type: ConnectionType
  size?: number
}

export function ChannelTypeIcon({ type, size = 28 }: ChannelTypeIconProps) {
  const src = IMAGE_ICONS[type]
  if (src) {
    return <Image src={src} alt={type} width={size} height={size} className='object-contain' />
  }
  return <span className='text-xl'>{CONNECTION_TYPE_ICONS[type] ?? '📡'}</span>
}
