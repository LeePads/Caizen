'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
  type SVGProps,
} from 'react';
import {
  MotionConfig,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  Cloud,
  Database,
  Download,
  Github,
  ShieldCheck,
} from 'lucide-react';

import CloudLoginModal from '@/components/landing/CloudLoginModal';
import { getSupabaseClient, isCloudSyncConfigured } from '@/lib/supabase';
import { useAndroidRelease } from '@/hooks/use-android-release';
import { PUBLIC_GITHUB_URL, PUBLIC_RELEASES_URL } from '@/lib/public-release';

import styles from './landing-page.module.css';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type AuthStatus = 'checking' | 'signed-out' | 'redirecting' | 'error';

const valuePoints: Array<{
  title: string;
  copy: string;
  icon: Icon;
}> = [
  {
    title: 'On your device',
    copy: 'Core records stay in your local profile, ready for everyday use.',
    icon: ShieldCheck,
  },
  {
    title: 'Your own backup',
    copy: 'Export a backup and keep a recovery copy outside the app.',
    icon: Database,
  },
  {
    title: 'Cloud on your terms',
    copy: isCloudSyncConfigured
      ? 'Connect an account for Cloud Backup and restore when you need them.'
      : 'Cloud Backup is unavailable on this site. You can still use Caizen locally.',
    icon: Cloud,
  },
];

const otherProjects = [
  { name: 'Tiny Surprise', url: 'https://tinysurprise.vercel.app/' },
  { name: 'Micaiah Alban', url: 'https://micaiah-alban.vercel.app/' },
  { name: 'CAIT CMS', url: 'https://caitcms.vercel.app/auth/login' },
  { name: 'Likhalin', url: 'https://likhalin.vercel.app/' },
];

export default function LandingPageClient() {
  const router = useRouter();
  const androidRelease = useAndroidRelease();
  const androidApkUrl = androidRelease.status === 'available' ? androidRelease.url : null;
  const androidNote = androidRelease.status === 'available'
    ? 'Android may ask you to allow installation from your browser.'
    : androidRelease.status === 'checking'
      ? 'Checking the latest public Android release…'
      : androidRelease.status === 'error'
        ? 'We could not check the Android download right now.'
        : androidRelease.reason === 'no-release'
          ? 'No public Android release has been published yet.'
          : 'The latest public release does not include an Android APK yet.';
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const redirectingRef = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isCloudSyncConfigured) {
      setAuthStatus('signed-out');
      return;
    }

    let active = true;
    let timedOut = false;
    let timeoutId: number | undefined;
    let unsubscribe = () => {};

    const showSessionError = () => {
      if (!active) return;
      setAuthStatus('error');
      setAuthError('We could not confirm your Cloud session. You can retry or continue locally.');
    };

    const handleSession = (session: { user: unknown } | null) => {
      if (!active || (!session && timedOut)) return;
      if (session) {
        if (redirectingRef.current) return;
        redirectingRef.current = true;
        setAuthError(null);
        setAuthStatus('redirecting');
        router.replace('/app/');
      } else {
        setAuthError(null);
        setAuthStatus('signed-out');
      }
    };

    try {
      const supabase = getSupabaseClient();
      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        handleSession(session);
      });
      unsubscribe = () => authListener.subscription.unsubscribe();

      timeoutId = window.setTimeout(() => {
        timedOut = true;
        showSessionError();
      }, 8000);

      void supabase.auth.getSession()
        .then(({ data: { session } }) => {
          if (timeoutId !== undefined) window.clearTimeout(timeoutId);
          handleSession(session);
        })
        .catch(() => {
          if (timeoutId !== undefined) window.clearTimeout(timeoutId);
          if (!timedOut) showSessionError();
        });
    } catch {
      showSessionError();
    }

    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [router, sessionAttempt]);
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(max-width: 899px)');
    const update = () => setIsCompact(media.matches);
    update();
    media.addEventListener('change', update);

    return () => media.removeEventListener('change', update);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.landingTheme}>
        <a className={styles.skipLink} href="#landing-content">
          Skip to content
        </a>

        <main id="landing-content" className={styles.landingRoot}>
          <section ref={heroRef} className={styles.hero} aria-labelledby="hero-title">
            <LandingNav onCloudClick={() => setLoginOpen(true)} />

            <div className={styles.heroCopy}>
              <h1 id="hero-title" className={styles.heroTitle} aria-label="Your life, in one place.">
                <span className={styles.heroLine} aria-hidden="true"><span>Your life,</span></span>
                <span className={styles.heroLine} aria-hidden="true"><span>in one place.</span></span>
              </h1>
              <p className={styles.heroSummary}>
                Plan your day, manage money, and keep health, work, collections,
                and personal records together in one local-first workspace.
              </p>
              <div className={styles.heroActions}>
                <SignatureCta />
                <AndroidDownload url={androidApkUrl} checking={androidRelease.status === 'checking'} describedBy="hero-android-note" />
              </div>
              <p id="hero-android-note" className={styles.androidNote} role="status">
                {androidNote}
                {androidRelease.status !== 'available' && androidRelease.status !== 'checking' ? (
                  <> <a href={PUBLIC_RELEASES_URL} target="_blank" rel="noreferrer">View public releases</a></>
                ) : null}
              </p>
              <p className={styles.heroAssurance}>
                No account required
                <span aria-hidden="true">·</span> Cloud Backup is optional
              </p>
              <a href={PUBLIC_GITHUB_URL} target="_blank" rel="noreferrer" className={styles.heroGithub}>
                <Github aria-hidden="true" /> View on GitHub <ArrowUpRight aria-hidden="true" />
              </a>
              {isCloudSyncConfigured && authStatus !== 'signed-out' ? (
                <div
                  className={`${styles.authStatus} ${authStatus === 'error' ? styles.authStatusError : ''}`}
                  role={authStatus === 'error' ? 'alert' : 'status'}
                  aria-live="polite"
                >
                  <span>
                    {authStatus === 'redirecting'
                      ? 'Opening Caizen…'
                      : authStatus === 'error'
                        ? authError
                        : 'Checking your Cloud Backup session…'}
                  </span>
                  {authStatus === 'error' ? (
                    <span className={styles.authStatusActions}>
                      <button
                        type="button"
                        className={styles.authRetry}
                        onClick={() => {
                          setAuthError(null);
                          setAuthStatus('checking');
                          setSessionAttempt(attempt => attempt + 1);
                        }}
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        className={styles.authContinue}
                        onClick={() => {
                          setAuthError(null);
                          setAuthStatus('signed-out');
                        }}
                      >
                        Continue locally
                      </button>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <LandingHeroStage
              heroRef={heroRef}
              isCompact={isCompact}
              reduceMotion={reduceMotion}
            />
          </section>

          <LandingShowcase />

          <motion.section
            id="values"
            className={styles.localFirst}
            aria-labelledby="values-title"
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.18 }}
            transition={{ duration: 0.68, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={styles.localCopy}>
              <h2 id="values-title">Your records stay yours.</h2>
              <p>
                Keep a personal workspace on your device, with backups you
                control and a clear path to recovery.
              </p>
            </div>
            <div className={styles.localPoints}>
              {valuePoints.map(point => (
                <article key={point.title}>
                  <point.icon aria-hidden="true" />
                  <h3>{point.title}</h3>
                  <p>{point.copy}</p>
                </article>
              ))}
            </div>
          </motion.section>

          <footer className={styles.footer}>
            <div className={styles.footerContent}>
              <div className={styles.footerColumns}>
                <div className={styles.footerBrand}>
                  <Link href="/" className={styles.wordmark} aria-label="Caizen home">
                    <img src="/icons/caizen-primary-dark-3000.png" alt="Caizen" width={3000} height={820} />
                  </Link>
                  <p>A local-first workspace for everyday life.</p>
                  <span className={styles.footerPlatform}>Web + Android</span>
                </div>
                <nav className={styles.footerGroup} aria-label="Product links">
                  <h2>Product</h2>
                  <ul>
                    <li><Link href="/app/">Open Caizen</Link></li>
                    <li>{androidApkUrl
                      ? <a href={androidApkUrl}>Download Android APK</a>
                      : <a href={PUBLIC_RELEASES_URL} target="_blank" rel="noreferrer">Android releases</a>}</li>
                    <li><a href={PUBLIC_GITHUB_URL} target="_blank" rel="noreferrer">View on GitHub</a></li>
                  </ul>
                </nav>
                <nav className={styles.footerGroup} aria-label="Your data links">
                  <h2>Your data</h2>
                  <ul>
                    <li><a href="#values">Local-first &amp; backups</a></li>
                    <li><Link href="/privacy/">Privacy &amp; data</Link></li>
                  </ul>
                </nav>
                <nav className={`${styles.footerGroup} ${styles.footerProjects}`} aria-label="Other projects">
                  <h2>Other projects</h2>
                  <ul>
                    {otherProjects.map(project => (
                      <li key={project.url}>
                        <a href={project.url} target="_blank" rel="noreferrer">
                          {project.name} <ArrowUpRight aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </div>
          </footer>
        </main>

        {isCloudSyncConfigured ? (
          <CloudLoginModal
            isOpen={loginOpen}
            onClose={() => setLoginOpen(false)}
            onSignedIn={() => router.replace('/app/')}
            postSignIn="continue"
          />
        ) : null}
      </div>
    </MotionConfig>
  );
}

type LandingScrollProps = {
  isCompact: boolean;
  reduceMotion: boolean | null;
};

// Keep each target-based scroll hook mounted with its rendered section and ref.
function LandingHeroStage({
  heroRef,
  isCompact,
  reduceMotion,
}: LandingScrollProps & { heroRef: RefObject<HTMLElement | null> }) {
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroPhoneSpread = isCompact ? 24 : 84;
  const heroPhoneLift = isCompact ? 4 : 10;
  const heroPhoneLeftStartRotation = isCompact ? -2 : -6;
  const heroPhoneRightStartRotation = isCompact ? 2 : 6;
  const heroPhoneLeftEndRotation = isCompact ? -2.8 : -8;
  const heroPhoneRightEndRotation = isCompact ? 2.8 : 8;
  const heroStageY = useTransform(scrollYProgress, [0.08, 0.62], [10, 0]);
  const heroStageScale = useTransform(scrollYProgress, [0.08, 0.62], [0.97, 1]);
  const heroPhoneLeftX = useTransform(scrollYProgress, [0.08, 0.62], [0, -heroPhoneSpread]);
  const heroPhoneLeftY = useTransform(scrollYProgress, [0.08, 0.62], [0, -heroPhoneLift]);
  const heroPhoneLeftRotate = useTransform(
    scrollYProgress,
    [0.08, 0.62],
    [heroPhoneLeftStartRotation, heroPhoneLeftEndRotation],
  );
  const heroPhoneRightX = useTransform(scrollYProgress, [0.08, 0.62], [0, heroPhoneSpread]);
  const heroPhoneRightY = useTransform(scrollYProgress, [0.08, 0.62], [0, -heroPhoneLift]);
  const heroPhoneRightRotate = useTransform(
    scrollYProgress,
    [0.08, 0.62],
    [heroPhoneRightStartRotation, heroPhoneRightEndRotation],
  );

  return (
    <motion.figure
      className={styles.heroStage}
      style={
        reduceMotion
          ? { y: 0, scale: 1 }
          : { y: heroStageY, scale: heroStageScale }
      }
    >
      <div className={styles.heroDesktopFrame}>
        <MarketingScreenshot>
          <Image
            src="/landing/caizen-web-dashboard.png"
            alt="Caizen desktop Dashboard showing today's priorities and upcoming commitments."
            width={1920}
            height={918}
            priority
            sizes="(max-width: 767px) 92vw, (max-width: 1100px) 82vw, 940px"
          />
        </MarketingScreenshot>
      </div>
      <motion.div
        className={`${styles.heroPhone} ${styles.heroPhoneLeft} ${styles.androidScreenshot}`}
        aria-hidden="true"
        style={
          reduceMotion
            ? { x: -heroPhoneSpread, y: -heroPhoneLift, rotate: heroPhoneLeftEndRotation }
            : { x: heroPhoneLeftX, y: heroPhoneLeftY, rotate: heroPhoneLeftRotate }
        }
      >
        <Image
          src="/landing/caizen-android-lifehub.jpg"
          alt=""
          width={1260}
          height={2681}
          sizes="(max-width: 600px) 72vw, (max-width: 767px) 43vw, 250px"
        />
      </motion.div>
      <motion.div
        className={`${styles.heroPhone} ${styles.heroPhoneRight} ${styles.androidScreenshot}`}
        aria-hidden="true"
        style={
          reduceMotion
            ? { x: heroPhoneSpread, y: -heroPhoneLift, rotate: heroPhoneRightEndRotation }
            : { x: heroPhoneRightX, y: heroPhoneRightY, rotate: heroPhoneRightRotate }
        }
      >
        <Image
          src="/landing/caizen-android-money.jpg"
          alt=""
          width={1260}
          height={2667}
          sizes="(max-width: 600px) 23vw, (max-width: 767px) 38vw, 225px"
        />
      </motion.div>
      <figcaption className={styles.visuallyHidden}>
        The same Caizen workspace presented across desktop web and Android,
        with Life Hub and Money shown on the phones.
      </figcaption>
    </motion.figure>
  );
}

function LandingShowcase() {
  return (
    <section
      id="showcase"
      className={styles.showcase}
      aria-labelledby="showcase-title"
    >
      <div className={styles.showcaseCopy}>
        <div>
          <p className={styles.sectionEyebrow}>Inside Caizen</p>
          <h2 id="showcase-title">One daily view. Focused spaces for the details.</h2>
        </div>
        <p>
          Begin with what needs your attention today. Move into a focused
          space when you need the details, with your plans, money, and
          personal records close at hand.
        </p>
      </div>
      <div className={styles.showcaseStory}>
        <section className={styles.showcaseChapter} aria-labelledby="overview-title">
          <div className={styles.chapterHeading}>
            <span className={styles.chapterNumber} aria-hidden="true">01</span>
            <h3 id="overview-title">See your day clearly.</h3>
            <p>A daily overview before you dive into the details.</p>
          </div>
          <figure className={styles.showcaseDesktop}>
            <figcaption className={`${styles.screenshotCaption} ${styles.overviewCaption}`}>
              <h4>Dashboard</h4>
              <p>See what needs attention across your day.</p>
            </figcaption>
            <div className={styles.showcasePanel}>
              <MarketingScreenshot>
                <Image
                  src="/landing/caizen-web-dashboard.png"
                  alt="Caizen Dashboard with daily priorities and upcoming commitments."
                  width={1920}
                  height={918}
                  sizes="(max-width: 1280px) 94vw, 1240px"
                />
              </MarketingScreenshot>
            </div>
          </figure>
        </section>

        <section className={`${styles.showcaseChapter} ${styles.focusChapter}`} aria-labelledby="focus-title">
          <div className={styles.chapterCopy}>
            <span className={styles.chapterNumber} aria-hidden="true">02</span>
            <h3 id="focus-title">Make room for the details.</h3>
            <p>
              Give tasks, routines, and commitments a place in Life Hub.
              Then turn to Money for balances and upcoming payments.
              Focused spaces, ready wherever your day takes you.
            </p>
            <span className={styles.chapterPlatform}>Life Hub &amp; Money / Android</span>
          </div>
          <div className={styles.showcasePhones}>
            <figure className={styles.showcaseSupport}>
              <div className={styles.showcasePhoneFrame}>
                <Image
                  src="/landing/caizen-android-lifehub.jpg"
                  alt="Caizen Life Hub on Android."
                  width={1260}
                  height={2681}
                  sizes="(max-width: 600px) 68vw, 240px"
                />
              </div>
              <figcaption className={styles.screenshotCaption}>
                <h4>Life Hub</h4>
                <p>Plan tasks, routines, and commitments.</p>
              </figcaption>
            </figure>
            <figure className={styles.showcaseSupport}>
              <div className={styles.showcasePhoneFrame}>
                <Image
                  src="/landing/caizen-android-money.jpg"
                  alt="Caizen Money overview on Android."
                  width={1260}
                  height={2667}
                  sizes="(max-width: 600px) 68vw, 240px"
                />
              </div>
              <figcaption className={styles.screenshotCaption}>
                <h4>Money</h4>
                <p>See what is available after upcoming payments.</p>
              </figcaption>
            </figure>
          </div>
        </section>

        <section className={styles.showcaseChapter} aria-labelledby="records-title">
          <div className={styles.chapterHeading}>
            <span className={styles.chapterNumber} aria-hidden="true">03</span>
            <h3 id="records-title">Keep everything in its place.</h3>
            <p>From what you own to what you are working toward.</p>
          </div>
          <div className={styles.showcaseRecords}>
            <figure>
              <div className={styles.showcasePanel}>
                <MarketingScreenshot>
                  <Image
                    src="/landing/caizen-web-inventory.png"
                    alt="Caizen Inventory with item photos, values, and status."
                    width={1920}
                    height={918}
                    sizes="(max-width: 899px) 94vw, (max-width: 1280px) 53vw, 700px"
                  />
                </MarketingScreenshot>
              </div>
              <figcaption className={styles.screenshotCaption}>
                <h4>Inventory</h4>
                <p>Keep useful records of what you own.</p>
              </figcaption>
            </figure>
            <figure>
              <div className={styles.showcasePanel}>
                <MarketingScreenshot>
                  <Image
                    src="/landing/caizen-web-workhub.png"
                    alt="Caizen Work Hub project board with tasks organized by status."
                    width={1920}
                    height={918}
                    sizes="(max-width: 899px) 94vw, (max-width: 1280px) 38vw, 500px"
                  />
                </MarketingScreenshot>
              </div>
              <figcaption className={styles.screenshotCaption}>
                <h4>Work Hub</h4>
                <p>Keep projects organized and deadlines in view.</p>
              </figcaption>
            </figure>
          </div>
        </section>
      </div>
    </section>
  );
}

function LandingNav({ onCloudClick }: { onCloudClick: () => void }) {
  return (
    <header className={styles.navWrap}>
      <Link href="/" className={styles.wordmark} aria-label="Caizen home">
        <img src="/icons/caizen-primary-dark-3000.png" alt="Caizen" width={3000} height={820} />
      </Link>
      <nav className={styles.navLinks} aria-label="Landing page">
        <a href="#showcase">Product</a>
        <a href="#values">Your data</a>
      </nav>
      <div className={styles.navActions}>
        <a href={PUBLIC_GITHUB_URL} target="_blank" rel="noreferrer" className={styles.navGithub}>
          <Github aria-hidden="true" /> GitHub <ArrowUpRight aria-hidden="true" />
        </a>
        {isCloudSyncConfigured ? (
          <button type="button" className={styles.navCloud} onClick={onCloudClick}>Cloud sign in</button>
        ) : null}
      </div>
    </header>
  );
}

function SignatureCta() {
  return (
    <span className={styles.heroCtaShell}>
      <span className={styles.heroCtaGlow} aria-hidden="true" />
      <Link href="/app/" className={styles.heroCta}>
        <span className={styles.heroCtaLabel}>
          Open Caizen <ArrowRight aria-hidden="true" />
        </span>
      </Link>
    </span>
  );
}

function AndroidDownload({ url, checking, describedBy }: { url: string | null; checking: boolean; describedBy: string }) {
  if (!url) {
    return (
      <button type="button" disabled aria-describedby={describedBy} className={styles.androidLink}>
        <Download aria-hidden="true" />
        {checking ? 'Checking Android release…' : 'Android APK unavailable'}
      </button>
    );
  }

  return (
    <a
      href={url}
      aria-describedby={describedBy}
      className={styles.androidLink}
    >
      <Download aria-hidden="true" />
      Download Android APK
    </a>
  );
}

function MarketingScreenshot({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.marketingScreenshot}>{children}</div>
  );
}
