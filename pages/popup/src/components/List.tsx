import React, { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import openWindow from '@src/helpers/openWindow';
import type { User } from '@extension/shared';
import { useMainStore } from '@src/store';
import { Avatar, AvatarFallback, AvatarImage, Button, Checkbox, cn, Spinner } from '@extension/ui';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { useRateLimitedUnfollow } from '@src/hooks/useRateLimitedUnfollow';
import { Eye, EyeOff, UserMinus } from 'lucide-react';

interface ListProps {
  children: ReactNode;
  className?: string;
}

/** A single click waits this long so a double click can select the card instead. */
const DOUBLE_CLICK_MS = 250;

const openProfile = (userName: string) => {
  openWindow(`https://www.instagram.com/${userName}`);
};

/** Clicks on the card's own controls are theirs, not the card's. */
const isOnControl = (event: MouseEvent) => (event.target as HTMLElement).closest('button, a, [role="checkbox"]');

export default function List({ children, ...props }: ListProps) {
  return <div {...props}>{children}</div>;
}

interface SlideInCheckboxProps {
  show: boolean;
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}

/** A checkbox that slides in from the left in selection mode and takes no space otherwise. */
export function SlideInCheckbox({ show, checked, indeterminate, onCheckedChange, label }: SlideInCheckboxProps) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          key="checkbox"
          className="flex shrink-0 items-center overflow-hidden"
          initial={{ width: 0, opacity: 0, x: -12 }}
          animate={{ width: 28, opacity: 1, x: 0 }}
          exit={{ width: 0, opacity: 0, x: -12 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <Checkbox
            checked={checked}
            indeterminate={indeterminate}
            onCheckedChange={onCheckedChange}
            aria-label={label}
          />
        </motion.span>
      )}
    </AnimatePresence>
  );
}

interface ListItemProps {
  user: User;
  isSelected: boolean;
  isHidden: boolean;
  /** Something is selected, so checkboxes show and a click toggles selection. */
  selectionMode: boolean;
  onToggleSelect: (id: string, selected: boolean) => void;
  onToggleHidden: (id: string, hidden: boolean) => void;
  className?: string;
}

/**
 * Rows re-render only when their own props change, so ticking one checkbox in
 * a list of thousands does not redraw every row.
 */
export const ListItem = React.memo(function ListItem({
  user,
  isSelected,
  isHidden,
  selectionMode,
  onToggleSelect,
  onToggleHidden,
  className,
}: ListItemProps) {
  const hasInstagramTab = useMainStore(state => state.hasInstagramTab);
  const isBlocked = useMainStore(state => typeof state.blockedUntil === 'number' && state.blockedUntil > Date.now());
  const scanning = useMainStore(state => state.scanning);
  const { t } = useTranslation();
  const { unfollow } = useRateLimitedUnfollow();
  const clickTimer = useRef<number | undefined>(undefined);
  const HideIcon = isHidden ? Eye : EyeOff;
  const selectable = !isHidden;

  useEffect(() => () => window.clearTimeout(clickTimer.current), []);

  const handleClick = (event: MouseEvent) => {
    // The second click of a double click is handled by onDoubleClick.
    if (isOnControl(event) || event.detail > 1) return;
    if (selectionMode && selectable) {
      onToggleSelect(user.id, !isSelected);
      return;
    }
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => openProfile(user.username), DOUBLE_CLICK_MS);
  };

  const handleDoubleClick = (event: MouseEvent) => {
    if (isOnControl(event) || !selectable || selectionMode) return;
    window.clearTimeout(clickTimer.current);
    onToggleSelect(user.id, true);
  };

  // Keyboard: Enter opens the profile, Space selects.
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter') openProfile(user.username);
    if (event.key === ' ' && selectable) {
      event.preventDefault();
      onToggleSelect(user.id, !isSelected);
    }
  };

  // The card holds its own buttons, so it cannot be a button itself; keys are handled above.
  /* eslint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  return (
    <div
      tabIndex={0}
      className={cn(
        className,
        'cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected && 'border-primary/60 bg-primary/5',
      )}
      title={selectable && !selectionMode ? t('doubleClickToSelect') : undefined}
      aria-label={user.full_name ? `${user.full_name} (${user.username})` : user.username}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
    >
      <figure className="flex items-center gap-2 roomy:gap-3">
        <div className="flex shrink-0 items-center">
          <SlideInCheckbox
            show={selectionMode && selectable}
            checked={isSelected}
            onCheckedChange={checked => onToggleSelect(user.id, checked)}
            label={t('selectAccount', { username: user.username })}
          />
          <Avatar className="size-9 shrink-0 roomy:size-11">
            <AvatarFallback>{(user.full_name || user.username).slice(0, 1)}</AvatarFallback>
            <AvatarImage crossOrigin="anonymous" draggable="false" src={user.image} alt={user.username} />
          </Avatar>
        </div>

        <figcaption className="grid min-w-0 flex-1">
          <div className="inline-flex min-w-0 items-center gap-1 font-bold">
            {user.full_name && (
              <p title={user.full_name} className="min-w-0 truncate text-sm">
                {user.full_name}
              </p>
            )}
            {user.isVerified && user.full_name && <Verified />}
          </div>
          <div className="inline-flex min-w-0 items-center gap-1">
            <p className="min-w-0 truncate text-muted-foreground">{user.username}</p>
            {user.isVerified && !user.full_name && <Verified />}
          </div>
        </figcaption>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="size-9 p-0 text-muted-foreground"
            title={isHidden ? t('unhide') : t('hide')}
            aria-label={isHidden ? t('unhide') : t('hide')}
            onClick={() => onToggleHidden(user.id, !isHidden)}
          >
            <HideIcon className="size-4" />
          </Button>
          {hasInstagramTab && !isHidden && (
            <Button
              variant="outline"
              size="sm"
              disabled={user.unFollowLoading || isBlocked || scanning}
              onClick={() => unfollow(user)}
              className="relative w-9 whitespace-nowrap px-0 roomy:w-auto roomy:px-3"
              title={t('unfollow')}
              aria-label={t('unfollow')}
            >
              <Spinner className={cn('absolute inset-0 m-auto size-4', !user.unFollowLoading && 'hidden')} />
              <UserMinus className={cn('size-4 roomy:hidden', user.unFollowLoading && 'opacity-10')} />
              <span className={cn('hidden roomy:inline', user.unFollowLoading && 'opacity-10')}>{t('unfollow')}</span>
            </Button>
          )}
        </div>
      </figure>
    </div>
  );
  /* eslint-enable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex */
});

export function Verified() {
  return (
    <svg
      className="shrink-0"
      aria-label="Verified"
      color="rgb(0, 149, 246)"
      fill="rgb(0, 149, 246)"
      height="1em"
      role="img"
      viewBox="0 0 40 40"
      width="1em"
    >
      <title>Verified</title>
      <path
        d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Zm7.415 11.225 2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z"
        fillRule="evenodd"
      />
    </svg>
  );
}
