/**
 * Public privacy policy page (/privacy). Plain-English description of what
 * VIM_GYM actually collects and stores; the URL is registered on the Google
 * OAuth consent screen, so it must stay reachable without signing in.
 */
import {
  LegalPageLayout,
  legalStyles as s,
} from '../components/LegalPageLayout';

const CONTACT_EMAIL = 'gunnarlila2000@gmail.com';

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="August 8, 2026">
      <p style={s.p}>
        VIM_GYM is a free game for practicing Vim motions, run as an independent
        project. This policy describes what data we collect, why, and what we do
        with it — in plain English, because that&apos;s all there is to it.
      </p>

      <h2 style={s.h2}>What we collect</h2>
      <ul style={s.ul}>
        <li>
          <strong>Account info.</strong> When you sign in with Google or GitHub
          we receive your email address, name, and avatar image from that
          provider. We never see your password.
        </li>
        <li>
          <strong>Display name.</strong> The name you choose is shown publicly
          on leaderboards and to opponents in races.
        </li>
        <li>
          <strong>Gameplay data.</strong> Race results, completion times, task
          attempts, and the keystroke sequences you used to complete tasks
          (capped at roughly 50 keys per task). We store these to power your
          stats page, leaderboards, and efficiency scores.
        </li>
        <li>
          <strong>Technical data.</strong> A session token in your
          browser&apos;s local storage to keep you signed in, and standard
          server logs (including IP addresses) used for rate limiting and abuse
          prevention.
        </li>
      </ul>

      <h2 style={s.h2}>What we don&apos;t do</h2>
      <ul style={s.ul}>
        <li>No advertising and no third-party analytics trackers.</li>
        <li>We never sell your data or share it for marketing.</li>
      </ul>

      <h2 style={s.h2}>Who processes the data</h2>
      <p style={s.p}>
        Data is stored and processed by our infrastructure providers: Supabase
        (authentication and database) and Fly.io (game servers). Sign-in is
        handled by Google or GitHub under their own privacy policies. These
        providers process data on our behalf and don&apos;t use it for their own
        purposes.
      </p>

      <h2 style={s.h2}>Retention and deletion</h2>
      <p style={s.p}>
        We keep your data while your account exists. To delete your account and
        its data, email{' '}
        <a style={s.a} href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>{' '}
        from the address you signed up with and we&apos;ll remove it. You can
        also ask for a copy of the data we hold about you.
      </p>

      <h2 style={s.h2}>Children</h2>
      <p style={s.p}>
        VIM_GYM is not directed at children under 13, and we don&apos;t
        knowingly collect data from them.
      </p>

      <h2 style={s.h2}>Changes</h2>
      <p style={s.p}>
        If this policy changes materially we&apos;ll update this page and the
        date above.
      </p>

      <h2 style={s.h2}>Contact</h2>
      <p style={s.p}>
        Questions? Email{' '}
        <a style={s.a} href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalPageLayout>
  );
}
