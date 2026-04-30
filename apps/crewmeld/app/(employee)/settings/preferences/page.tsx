'use client'

import { useEffect, useRef, useState } from 'react'
import { Globe, KeyRound, User } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSession } from '@/lib/auth/auth-client'
import { useTranslation } from '@/hooks/use-translation'
import { useLocaleStore } from '@/stores/locale/store'
import { ChangePasswordDialog } from '../../components/change-password-dialog'
import { SettingsTabs } from '../settings-tabs'
import { ChangeUsernameDialog } from './change-username-dialog'

export default function PreferencesPage() {
  const { t, locale } = useTranslation()
  const { setLocale } = useLocaleStore()
  const { data: session } = useSession()

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false)
  const [hasCredentialAccount, setHasCredentialAccount] = useState(false)
  const credentialChecked = useRef(false)

  const user = session?.user

  useEffect(() => {
    if (!user || credentialChecked.current) return
    credentialChecked.current = true
    fetch('/api/auth/accounts?provider=credential')
      .then((res) => res.json())
      .then((data) => {
        if (data.accounts?.length > 0) {
          setHasCredentialAccount(true)
        }
      })
      .catch(() => {})
  }, [user])

  return (
    <div>
      <div className='mb-6'>
        <h1 className='font-bold text-2xl text-gray-900'>{t('settings.title')}</h1>
        <p className='mt-1 text-gray-500 text-sm'>{t('settings.subtitlePreferences')}</p>
      </div>

      <SettingsTabs />

      <div className='space-y-6'>
        {/* ── Account Security ── */}
        <section>
          <h2 className='mb-3 font-semibold text-gray-500 text-sm'>
            {t('settings.preferencesSectionAccount')}
          </h2>
          <div className='divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white'>
            {/* Username */}
            <div className='flex items-center justify-between p-5'>
              <div className='flex items-center gap-3'>
                <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50'>
                  <User className='h-5 w-5 text-blue-600' />
                </div>
                <div>
                  <h3 className='font-medium text-gray-900 text-sm'>
                    {t('settings.preferencesUsernameLabel')}
                  </h3>
                  <p className='text-gray-500 text-sm'>{user?.name ?? '-'}</p>
                </div>
              </div>
              <button
                type='button'
                onClick={() => setUsernameDialogOpen(true)}
                className='rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 text-sm hover:bg-gray-50'
              >
                {t('settings.preferencesUsernameBtn')}
              </button>
            </div>

            {/* Change password */}
            {hasCredentialAccount && (
              <div className='flex items-center justify-between p-5'>
                <div className='flex items-center gap-3'>
                  <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50'>
                    <KeyRound className='h-5 w-5 text-blue-600' />
                  </div>
                  <div>
                    <h3 className='font-medium text-gray-900 text-sm'>
                      {t('settings.preferencesPasswordLabel')}
                    </h3>
                    <p className='text-gray-500 text-sm'>{t('settings.preferencesPasswordDesc')}</p>
                  </div>
                </div>
                <button
                  type='button'
                  onClick={() => setPasswordDialogOpen(true)}
                  className='rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 text-sm hover:bg-gray-50'
                >
                  {t('settings.preferencesPasswordBtn')}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ── General ── */}
        <section>
          <h2 className='mb-3 font-semibold text-gray-500 text-sm'>
            {t('settings.preferencesSectionGeneral')}
          </h2>
          <div className='rounded-xl border border-gray-200 bg-white'>
            {/* Interface language */}
            <div className='flex items-center justify-between p-5'>
              <div className='flex items-center gap-3'>
                <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50'>
                  <Globe className='h-5 w-5 text-blue-600' />
                </div>
                <div>
                  <h3 className='font-medium text-gray-900 text-sm'>
                    {t('settings.preferencesLanguageLabel')}
                  </h3>
                  <p className='text-gray-500 text-sm'>{t('settings.preferencesLanguageDesc')}</p>
                </div>
              </div>
              <Select value={locale} onValueChange={(v) => setLocale(v as 'zh-CN' | 'en')}>
                <SelectTrigger className='w-36'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='zh-CN'>{t('settings.languageZhCN')}</SelectItem>
                  <SelectItem value='en'>English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
      </div>

      <ChangeUsernameDialog
        open={usernameDialogOpen}
        onOpenChange={setUsernameDialogOpen}
        currentName={user?.name ?? ''}
      />
      <ChangePasswordDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />
    </div>
  )
}
