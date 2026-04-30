'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/hooks/use-translation'

const CONTACT_EMAIL = 'crewmeld@proinsight.io'

export default function TermsPage() {
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

        <h1 className='mb-2 font-bold text-3xl tracking-tight'>{t('legal.terms.title')}</h1>
        <p className='mb-10 text-muted-foreground text-sm'>{t('legal.terms.lastUpdated')}</p>

        <div className='space-y-8 text-[15px] text-muted-foreground leading-relaxed'>
          {/* Section 1 - Acceptance of Terms */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.terms.section1Title')}
            </h2>
            <p>{t('legal.terms.section1Text')}</p>
          </section>

          {/* Section 2 - Services */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.terms.section2Title')}
            </h2>
            <p>{t('legal.terms.section2Text')}</p>
          </section>

          {/* Section 3 - User Accounts */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.terms.section3Title')}
            </h2>
            <ul className='list-inside list-disc space-y-2'>
              <li>{t('legal.terms.section3Item1')}</li>
              <li>{t('legal.terms.section3Item2')}</li>
              <li>{t('legal.terms.section3Item3')}</li>
            </ul>
          </section>

          {/* Section 4 - Acceptable Use */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.terms.section4Title')}
            </h2>
            <p className='mb-2'>{t('legal.terms.section4Text')}</p>
            <ul className='list-inside list-disc space-y-2'>
              <li>{t('legal.terms.section4Item1')}</li>
              <li>{t('legal.terms.section4Item2')}</li>
              <li>{t('legal.terms.section4Item3')}</li>
              <li>{t('legal.terms.section4Item4')}</li>
            </ul>
          </section>

          {/* Section 5 - Intellectual Property */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.terms.section5Title')}
            </h2>
            <p>{t('legal.terms.section5Text')}</p>
          </section>

          {/* Section 6 - Disclaimer of Warranties */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.terms.section6Title')}
            </h2>
            <ul className='list-inside list-disc space-y-2'>
              <li>{t('legal.terms.section6Item1')}</li>
              <li>{t('legal.terms.section6Item2')}</li>
              <li>{t('legal.terms.section6Item3')}</li>
              <li>{t('legal.terms.section6Item4')}</li>
            </ul>
          </section>

          {/* Section 7 - Modification and Termination */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.terms.section7Title')}
            </h2>
            <p>{t('legal.terms.section7Text')}</p>
          </section>

          {/* Section 8 - Changes to Terms */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.terms.section8Title')}
            </h2>
            <p>{t('legal.terms.section8Text')}</p>
          </section>

          {/* Section 9 - Governing Law & Dispute Resolution */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.terms.section9Title')}
            </h2>
            <p>{t('legal.terms.section9Text')}</p>
          </section>

          {/* Section 10 - Contact Us */}
          <section>
            <h2 className='mb-3 font-semibold text-foreground text-lg'>
              {t('legal.terms.section10Title')}
            </h2>
            <p>
              {t('legal.terms.section10Text')}{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className='underline-offset-4 transition hover:text-foreground hover:underline'
              >
                {CONTACT_EMAIL}
              </a>{' '}
              {t('legal.terms.section10Suffix')}
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
