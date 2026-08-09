/**
 * SiteBanner: the black top navigation bar shared by authenticated pages
 * (home, profile, about). Shows the VIM_GYM wordmark as a link back to the
 * home menu, external links (GitHub, Discord), site pages, and an account
 * dropdown (labelled with the user's display name) holding Profile and
 * Sign out.
 *
 * Pages render this at the top of their layout instead of copying the
 * banner markup, so navigation stays consistent across the site.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { colors } from '../theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const styles: Record<string, React.CSSProperties> = {
  topBanner: {
    width: '100%',
    minHeight: '56px',
    boxSizing: 'border-box',
    padding: '16px 32px',
    background: '#000000',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 1000,
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: '32px',
  },
  navLink: {
    fontSize: '15px',
    fontWeight: 600,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    textDecoration: 'none',
    textTransform: 'uppercase',
    transition: 'color 0.2s ease',
  },
  navLinkWithIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  navIcon: {
    width: '16px',
    height: '16px',
    flexShrink: 0,
  },
  bannerTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    margin: 0,
    textDecoration: 'none',
  },
  accountWrap: {
    position: 'relative',
  },
  accountMenu: {
    position: 'absolute',
    top: 'calc(100% + 12px)',
    right: 0,
    minWidth: '160px',
    display: 'flex',
    flexDirection: 'column',
    background: '#000000',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    padding: '8px',
    gap: '4px',
    zIndex: 1001,
  },
  accountMenuItem: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    textDecoration: 'none',
    textTransform: 'uppercase',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 12px',
    cursor: 'pointer',
  },
};

/** Longest account-trigger label before the name is cut with an ellipsis. */
const ACCOUNT_LABEL_MAX_CHARS = 12;

/** "averylongdisplayname" -> "averylongdis…"; short names pass through. */
export function accountLabel(displayName: string | undefined): string {
  if (!displayName) return 'ACCOUNT';
  if (displayName.length <= ACCOUNT_LABEL_MAX_CHARS) return displayName;
  return `${displayName.slice(0, ACCOUNT_LABEL_MAX_CHARS)}…`;
}

/**
 * Dropdown showing the signed-in user's display name; opens to Profile and
 * Sign out. Closes when the user clicks anywhere outside it.
 */
function AccountDropdown() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={wrapRef} style={styles.accountWrap}>
      <button
        style={{
          ...styles.navLink,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={accountLabel(profile?.display_name)}
        onClick={() => setOpen((prev) => !prev)}
      >
        {accountLabel(profile?.display_name)} ▾
      </button>
      {open && (
        <div style={styles.accountMenu}>
          <Link
            to="/profile"
            style={styles.accountMenuItem}
            onClick={() => setOpen(false)}
          >
            Profile
          </Link>
          <button
            style={styles.accountMenuItem}
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function GitHubIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      style={style}
    >
      <path d="M12 .5a12 12 0 0 0-3.794 23.385c.6.111.82-.26.82-.577 0-.286-.011-1.043-.016-2.048-3.338.725-4.042-1.61-4.042-1.61-.546-1.386-1.334-1.755-1.334-1.755-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.236 1.84 1.236 1.07 1.832 2.807 1.303 3.492.996.108-.775.418-1.303.762-1.603-2.665-.303-5.467-1.332-5.467-5.93 0-1.31.468-2.381 1.235-3.221-.124-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 6.006 0c2.291-1.553 3.298-1.23 3.298-1.23.654 1.653.243 2.873.12 3.176.769.84 1.233 1.911 1.233 3.221 0 4.609-2.807 5.624-5.48 5.921.43.371.814 1.102.814 2.222 0 1.604-.015 2.899-.015 3.293 0 .319.216.694.825.576A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

function DiscordIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      style={style}
    >
      <path d="M20.317 4.369A19.8 19.8 0 0 0 15.56 3a13.6 13.6 0 0 0-.605 1.244 18.3 18.3 0 0 0-5.91 0A13.6 13.6 0 0 0 8.44 3a19.7 19.7 0 0 0-4.758 1.369C.673 8.874-.15 13.267.262 17.61a19.9 19.9 0 0 0 5.834 2.931 14.5 14.5 0 0 0 1.25-2.035 12.8 12.8 0 0 1-1.968-.95c.166-.124.329-.253.487-.386 3.797 1.783 7.913 1.783 11.665 0 .16.133.322.262.488.386-.623.368-1.28.688-1.97.95.362.711.782 1.39 1.25 2.035a19.8 19.8 0 0 0 5.835-2.931c.483-5.04-.826-9.393-3.816-13.241Zm-11.54 10.577c-1.138 0-2.075-1.042-2.075-2.323S7.62 10.3 8.778 10.3c1.167 0 2.093 1.053 2.074 2.323.001 1.281-.926 2.323-2.074 2.323Zm6.445 0c-1.138 0-2.074-1.042-2.074-2.323s.918-2.323 2.074-2.323c1.167 0 2.093 1.053 2.074 2.323 0 1.281-.926 2.323-2.074 2.323Z" />
    </svg>
  );
}

export function SiteBanner() {
  return (
    <div style={styles.topBanner}>
      <Link to="/" style={styles.bannerTitle}>
        VIM_GYM
      </Link>
      <div style={styles.navLinks}>
        <a
          href="https://github.com/swaggermuffin64/vim-racing"
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...styles.navLink, ...styles.navLinkWithIcon }}
        >
          <GitHubIcon style={styles.navIcon} />
          GITHUB
        </a>
        <a
          href="https://discord.gg/JNHRpdEbaG"
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...styles.navLink, ...styles.navLinkWithIcon }}
        >
          <DiscordIcon style={styles.navIcon} />
          DISCORD
        </a>
        <Link to="/about" style={styles.navLink}>
          ABOUT
        </Link>
        <a
          href="https://buymeacoffee.com/jacksonfisk"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.navLink}
        >
          SUPPORT
        </a>
        <AccountDropdown />
      </div>
    </div>
  );
}
