/**
 * Public terms of service page (/terms). Short, readable terms for a free
 * competitive game: fair play, account conduct, and as-is disclaimers. Like
 * /privacy, this URL is registered with Google OAuth and must stay
 * reachable without signing in.
 */
import {
  LegalPageLayout,
  legalStyles as s,
} from '../components/LegalPageLayout';

const CONTACT_EMAIL = 'gunnarlila2000@gmail.com';

export default function TermsOfService() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="August 8, 2026">
      <p style={s.p}>
        By using VIM_GYM you agree to these terms. They&apos;re short — please
        actually read them.
      </p>

      <h2 style={s.h2}>The service</h2>
      <p style={s.p}>
        VIM_GYM is a free game for practicing Vim motions. It&apos;s provided
        &quot;as is&quot;, without warranties of any kind. It&apos;s a hobby
        project: we don&apos;t guarantee uptime, and features may change or
        disappear.
      </p>

      <h2 style={s.h2}>Your account</h2>
      <ul style={s.ul}>
        <li>
          You sign in through Google or GitHub and are responsible for activity
          on your account.
        </li>
        <li>
          Your display name is public. Names that are offensive, misleading, or
          impersonate others may be changed or removed.
        </li>
      </ul>

      <h2 style={s.h2}>Fair play</h2>
      <ul style={s.ul}>
        <li>
          Don&apos;t cheat: no bots, macros, automation, replay forging, or
          exploiting bugs to inflate times or rankings.
        </li>
        <li>
          Don&apos;t attack the service: no scraping, flooding, or attempting to
          bypass rate limits or authentication.
        </li>
        <li>
          We may remove leaderboard entries, reset stats, or suspend accounts
          that break these rules — competitive integrity is the whole point of
          the game.
        </li>
      </ul>

      <h2 style={s.h2}>Content and code</h2>
      <p style={s.p}>
        The VIM_GYM source code is open source on GitHub under its own license.
        These terms cover the hosted service, not the code.
      </p>

      <h2 style={s.h2}>Liability</h2>
      <p style={s.p}>
        To the maximum extent permitted by law, VIM_GYM and its operator are not
        liable for any indirect or consequential damages arising from use of the
        service. The service is free; our total liability is limited to the
        amount you paid us, which is zero.
      </p>

      <h2 style={s.h2}>Termination</h2>
      <p style={s.p}>
        You can stop using VIM_GYM at any time and request account deletion (see
        the Privacy Policy). We may suspend accounts that violate these terms.
      </p>

      <h2 style={s.h2}>Changes</h2>
      <p style={s.p}>
        We may update these terms; material changes will be reflected on this
        page with a new date. Continuing to use the service after changes means
        you accept them.
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
