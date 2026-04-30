'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/hooks/use-translation'

const CONTACT_EMAIL = 'crewmeld@proinsight.io'

export default function PrivacyPage() {
  const { t } = useTranslation()

  return (
    <div className='min-h-screen bg-background text-foreground'>
      <div className='mx-auto max-w-3xl px-6 py-16'>
        <Link
          href='/login'
          className='mb-10 inline-flex items-center gap-1.5 text-muted-foreground text-sm transition hover:text-foreground'
        >
          <ArrowLeft className='h-4 w-4' />
          {t('legal.backToLogin')}
        </Link>

        <h1 className='mb-2 font-bold text-3xl tracking-tight'>{t('legal.privacy.title')}</h1>
        <p className='mb-10 text-muted-foreground text-sm'>{t('legal.privacy.lastUpdated')}</p>

        <div className='space-y-8 text-[15px] text-muted-foreground leading-relaxed'>
          {/* Section 1 - Introduction */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.privacy.section1Title')}
            </h2>
            <p>{t('legal.privacy.section1Text')}</p>
          </section>

          {/* Section 2 - Information We Collect */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.privacy.section2Title')}
            </h2>
            <p className='mb-2'>{t('legal.privacy.section2Text')}</p>
            <ul className='list-inside list-disc space-y-2'>
              <li>
                <strong>{t('legal.privacy.section2Item1')}</strong>
              </li>
              <li>
                <strong>{t('legal.privacy.section2Item2')}</strong>
              </li>
              <li>
                <strong>{t('legal.privacy.section2Item3')}</strong>
              </li>
              <li>
                <strong>{t('legal.privacy.section2Item4')}</strong>
              </li>
            </ul>
          </section>

          {/* Section 3 - How We Use Your Information */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.privacy.section3Title')}
            </h2>
            <p className='mb-2'>{t('legal.privacy.section3Text')}</p>
            <ul className='list-inside list-disc space-y-2'>
              <li>{t('legal.privacy.section3Item1')}</li>
              <li>{t('legal.privacy.section3Item2')}</li>
              <li>{t('legal.privacy.section3Item3')}</li>
              <li>{t('legal.privacy.section3Item4')}</li>
              <li>{t('legal.privacy.section3Item5')}</li>
            </ul>
          </section>

          {/* Section 4 - Data Storage & Security */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.privacy.section4Title')}
            </h2>
            <ul className='list-inside list-disc space-y-2'>
              <li>{t('legal.privacy.section4Item1')}</li>
              <li>{t('legal.privacy.section4Item2')}</li>
              <li>{t('legal.privacy.section4Item3')}</li>
            </ul>
          </section>

          {/* Section 5 - Information Sharing */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.privacy.section5Title')}
            </h2>
            <p className='mb-2'>{t('legal.privacy.section5Text')}</p>
            <ul className='list-inside list-disc space-y-2'>
              <li>{t('legal.privacy.section5Item1')}</li>
              <li>{t('legal.privacy.section5Item2')}</li>
              <li>{t('legal.privacy.section5Item3')}</li>
              <li>{t('legal.privacy.section5Item4')}</li>
            </ul>
          </section>

          {/* Section 6 - International Data Transfers */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.privacy.section6Title')}
            </h2>
            <p>{t('legal.privacy.section6Text')}</p>
          </section>

          {/* Section 7 - Cookies & Similar Technologies */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.privacy.section7Title')}
            </h2>
            <p>{t('legal.privacy.section7Text')}</p>
          </section>

          {/* Section 8 - Third-Party Services */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.privacy.section8Title')}
            </h2>
            <p>{t('legal.privacy.section8Text')}</p>
          </section>

          {/* Section 9 - Your Rights */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.privacy.section9Title')}
            </h2>
            <p className='mb-2'>{t('legal.privacy.section9Text')}</p>
            <ul className='list-inside list-disc space-y-2'>
              <li>
                <strong>{t('legal.privacy.section9Item1')}</strong>
              </li>
              <li>
                <strong>{t('legal.privacy.section9Item2')}</strong>
              </li>
              <li>
                <strong>{t('legal.privacy.section9Item3')}</strong>
              </li>
              <li>
                <strong>{t('legal.privacy.section9Item4')}</strong>
              </li>
              <li>
                <strong>{t('legal.privacy.section9Item5')}</strong>
              </li>
            </ul>
            <p className='mt-2'>
              {t('legal.privacy.section9Contact')}{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className='underline-offset-4 transition hover:text-foreground hover:underline'
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </section>

          {/* Section 10 - Children's Privacy */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.privacy.section10Title')}
            </h2>
            <p>{t('legal.privacy.section10Text')}</p>
          </section>

          {/* Section 11 - Changes to This Policy */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.privacy.section11Title')}
            </h2>
            <p>{t('legal.privacy.section11Text')}</p>
          </section>

          {/* Section 12 - Contact Us */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.privacy.section12Title')}
            </h2>
            <p>
              {t('legal.privacy.section12Text')}{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className='underline-offset-4 transition hover:text-foreground hover:underline'
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </section>
        </div>

        <div className='mt-16 space-y-2 border-t pt-6 text-center text-muted-foreground text-sm'>
          <p>
            {t('legal.needHelp')}{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className='underline-offset-4 transition hover:text-foreground hover:underline'
            >
              {t('legal.contactSupport')}
            </a>
          </p>
          <p className='text-xs'>
            &copy; {new Date().getFullYear()} CrewMeld. {t('legal.allRightsReserved')}
          </p>
        </div>
      </div>
    </div>
  )
}
