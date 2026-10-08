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
  ShieldCheck,
} from 'lucide-react';

import CloudLoginModal from '@/components/landing/CloudLoginModal';
import { getSupabaseClient, isCloudSyncConfigured } from '@/lib/supabase';

import styles from './landing-page.module.css';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type AuthStatus = 'checking' | 'signed-out' | 'redirecting' | 'error';

// Served by the site itself from public/downloads/ (the APK is gitignored, so it must exist where the site is built).
const androidApkUrl = '/downloads/caizen-android.apk';

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

export default function LandingPageClient() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const showcaseRef = useRef<HTMLElement>(null);
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
                <AndroidDownload describedBy="hero-android-note" />
              </div>
              <p id="hero-android-note" className={styles.androidNote}>
                Android may ask you to allow installation from your browser.
              </p>
              <p className={styles.heroAssurance}>
                No account required
                <span aria-hidden="true">·</span> Cloud Backup is optional
              </p>
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

          <LandingShowcase
            showcaseRef={showcaseRef}
            isCompact={isCompact}
            reduceMotion={reduceMotion}
          />

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
                </div>
                <nav className={styles.footerGroup} aria-label="Product links">
                  <h2>Product</h2>
                  <ul>
                    <li><Link href="/app/">Open Caizen</Link></li>
                    <li><a href={androidApkUrl} download="caizen-android.apk">Android APK</a></li>
                    <li><Link href="/privacy/">Privacy &amp; data</Link></li>
                  </ul>
                </nav>
                <div className={styles.footerGroup}>
                  <h2>More</h2>
                  <ul>
                    <li>
                      <a href="https://tinysurprise.vercel.app/" target="_blank" rel="noreferrer">
                        Other projects <ArrowUpRight aria-hidden="true" />
                      </a>
                    </li>
                    <li><span className={styles.footerPlatform}>Web + Android</span></li>
                  </ul>
                </div>
              </div>
              <p className={styles.footerBottom}>Caizen · Version 1</p>
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

function LandingShowcase({
  showcaseRef,
  isCompact,
  reduceMotion,
}: LandingScrollProps & { showcaseRef: RefObject<HTMLElement | null> }) {
  const { scrollYProgress: showcaseScrollProgress } = useScroll({
    target: showcaseRef,
    offset: ['start end', 'end start'],
  });
  const showcaseRise = isCompact ? 20 : 28;
  const showcaseMainY = useTransform(showcaseScrollProgress, [0.08, 0.5], [showcaseRise, 0]);
  const showcaseMainScale = useTransform(showcaseScrollProgress, [0.08, 0.5], [0.965, 1]);
  const showcaseMainOpacity = useTransform(showcaseScrollProgress, [0.08, 0.42], [0.7, 1]);

  return (
    <motion.section
      id="showcase"
      ref={showcaseRef}
      className={styles.showcase}
      aria-labelledby="showcase-title"
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.68, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={styles.showcaseCopy}>
        <h2 id="showcase-title">One daily view. Focused spaces for the details.</h2>
        <p>
          See today’s tasks and routines alongside work deadlines, recurring
          payments, and upcoming dates. Open the relevant section for the
          details; each record keeps its own place.
        </p>
      </div>
      <div className={styles.showcaseStage}>
        <motion.figure
          className={styles.showcaseDesktop}
          style={
            reduceMotion
              ? undefined
              : {
                  y: showcaseMainY,
                  scale: showcaseMainScale,
                  opacity: showcaseMainOpacity,
                }
          }
        >
          <div className={styles.showcasePanel}>
            <MarketingScreenshot>
              <Image
                src="/landing/caizen-web-dashboard.png"
                alt="Caizen Dashboard with daily priorities and upcoming commitments."
                width={1920}
                height={918}
                sizes="(max-width: 899px) 92vw, (max-width: 1300px) 58vw, 800px"
              />
            </MarketingScreenshot>
          </div>
          <figcaption className={styles.screenshotCaption}>
            <h3>Dashboard</h3>
            <p>See what needs attention across your day.</p>
          </figcaption>
        </motion.figure>
        <div className={styles.showcaseAside}>
          <figure className={styles.showcaseSupport}>
            <div className={styles.showcasePhoneFrame}>
              <Image
                src="/landing/caizen-android-lifehub.jpg"
                alt="Caizen Life Hub on Android."
                width={1260}
                height={2681}
                sizes="(max-width: 899px) 42vw, 180px"
              />
            </div>
            <figcaption className={styles.screenshotCaption}>
              <h3>Life Hub</h3>
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
                sizes="(max-width: 899px) 42vw, 180px"
              />
            </div>
            <figcaption className={styles.screenshotCaption}>
              <h3>Money</h3>
              <p>See what is available after upcoming payments.</p>
            </figcaption>
          </figure>
        </div>
      </div>
      <div className={styles.showcaseBreadth}>
        <p className={styles.breadthIntro}>Keep the details in their own space, with the day’s priorities in view.</p>
        <figure>
          <div className={styles.showcasePanel}>
            <MarketingScreenshot>
              <Image
                src="/landing/caizen-web-inventory.png"
                alt="Caizen Inventory with item photos, values, and status."
                width={1920}
                height={918}
                sizes="(max-width: 600px) 92vw, (max-width: 1300px) 44vw, 600px"
              />
            </MarketingScreenshot>
          </div>
          <figcaption className={styles.screenshotCaption}>
            <h3>Inventory</h3>
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
                sizes="(max-width: 600px) 92vw, (max-width: 1300px) 44vw, 600px"
              />
            </MarketingScreenshot>
          </div>
          <figcaption className={styles.screenshotCaption}>
            <h3>Work Hub</h3>
            <p>Keep projects organized and deadlines in view.</p>
          </figcaption>
        </figure>
      </div>
    </motion.section>
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
        <a href="https://tinysurprise.vercel.app/" target="_blank" rel="noreferrer">Other projects</a>
      </nav>
      <div className={styles.navActions}>
        {isCloudSyncConfigured ? (
          <button type="button" onClick={onCloudClick}>Sign in to Cloud Backup</button>
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
        <span className={styles.heroCtaOrbit} aria-hidden="true" />
        <span className={styles.heroCtaInterior} aria-hidden="true" />
        <span className={styles.heroCtaLabel}>
          Start locally <ArrowRight aria-hidden="true" />
        </span>
      </Link>
    </span>
  );
}

function AndroidDownload({ describedBy }: { describedBy: string }) {
  return (
    <a
      href={androidApkUrl}
      download="caizen-android.apk"
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
