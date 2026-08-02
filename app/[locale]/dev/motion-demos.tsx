'use client';

import { Compass } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FieldError } from '@/components/ui/field-error';
import {
  Draw,
  FadeIn,
  FadeSwap,
  HoverLift,
  MountFade,
  Pop,
  RiseIn,
  Stagger,
  StaggerItem,
} from '@/components/ui/motion';
import { Sheet } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';

/**
 * Live demos for the /dev style guide (English-only internal copy, like the
 * rest of the guide's labels). Every primitive from components/ui/motion.tsx
 * plus the overlay system, each replayable so reviewers can watch the spring.
 */

function DemoLabel({ children }: { children: string }) {
  return (
    <p className="text-sarat-black-600 text-[11px] font-medium tracking-[0.2em] uppercase">
      {children}
    </p>
  );
}

const demoCard =
  'border-sarat-black/8 rounded-card flex h-24 items-center justify-center [border-width:0.5px] px-4 text-sm font-medium';

export function MotionDemos() {
  const [round, setRound] = useState(0);
  const [swapKey, setSwapKey] = useState(0);
  const [showError, setShowError] = useState(false);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sarat-black-600 max-w-xl text-sm">
          The one spring — damping 25, stiffness 280 — drives every primitive. Replay re-mounts the
          demos; everything degrades to a static render under reduced motion.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setRound((r) => r + 1)}>
          Replay
        </Button>
      </div>

      <div key={round} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <DemoLabel>MountFade (eager)</DemoLabel>
          <MountFade eager>
            <div className={demoCard}>Fades + lifts on mount</div>
          </MountFade>
        </div>
        <div className="flex flex-col gap-2">
          <DemoLabel>RiseIn — transform-only, LCP-safe</DemoLabel>
          <RiseIn>
            <div className={demoCard}>Rises; opacity never dips</div>
          </RiseIn>
        </div>
        <div className="flex flex-col gap-2">
          <DemoLabel>Pop — success focal point</DemoLabel>
          <Pop>
            <div className={demoCard}>Scales 0.8 → 1</div>
          </Pop>
        </div>
        <div className="flex flex-col gap-2">
          <DemoLabel>FadeIn — reveal on scroll</DemoLabel>
          <FadeIn>
            <div className={demoCard}>Springs in when in view</div>
          </FadeIn>
        </div>
        <div className="flex flex-col gap-2">
          <DemoLabel>HoverLift — 2px card lift</DemoLabel>
          <HoverLift>
            <div className={demoCard}>Hover me</div>
          </HoverLift>
        </div>
        <div className="flex flex-col gap-2">
          <DemoLabel>Draw — spine growth</DemoLabel>
          <div className={demoCard}>
            <div className="flex h-16 items-stretch gap-4">
              <Draw className="w-px">
                <span className="bg-saffron-gold block size-full" />
              </Draw>
              <Draw axis="x" delay={0.15} className="self-center">
                <span className="bg-sarat-black/20 block h-px w-24" />
              </Draw>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <DemoLabel>Stagger / StaggerItem — 60ms cascade</DemoLabel>
        <div key={`stagger-${round}`}>
          <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {['One', 'Two', 'Three', 'Four'].map((label) => (
              <StaggerItem key={label}>
                <div className={demoCard}>{label}</div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <DemoLabel>FadeSwap — keyed RSC swap</DemoLabel>
          <FadeSwap watch={swapKey}>
            <div className={demoCard}>Payload #{swapKey + 1}</div>
          </FadeSwap>
          <Button variant="secondary" size="sm" onClick={() => setSwapKey((k) => k + 1)}>
            Swap payload
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <DemoLabel>AnimatedNumber — counts in view</DemoLabel>
          <div className={demoCard} key={`count-${round}`}>
            <span className="font-display text-3xl font-semibold">
              <AnimatedNumber value={4820} />
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <DemoLabel>FieldError — spring slide-in</DemoLabel>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowError((v) => !v)}>
              Toggle error
            </Button>
            <FieldError>{showError ? 'This field is required.' : undefined}</FieldError>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <DemoLabel>EmptyState — Pop icon + FadeIn body</DemoLabel>
        <div
          key={`empty-${round}`}
          className="border-sarat-black/8 rounded-card [border-width:0.5px]"
        >
          <EmptyState
            icon={Compass}
            title="Nothing here yet"
            description="The calm empty state, now with an entrance."
          />
        </div>
      </div>
    </div>
  );
}

export function OverlayDemos() {
  const [sheetBottom, setSheetBottom] = useState(false);
  const [sheetStart, setSheetStart] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sarat-black-600 max-w-xl text-sm">
        Base UI overlays (focus trap, Esc, scroll lock) animated on the one spring. Floating layers
        carry the single --shadow-overlay token and 0.5px hairlines.
      </p>

      <div className="flex flex-wrap gap-3">
        <Dialog
          trigger={<Button variant="primary">Open dialog</Button>}
          title="Dialog title"
          description="Springs in at 24px radius with the overlay shadow. Esc or the backdrop closes it."
          footer={<Button variant="secondary">Footer action</Button>}
        />
        <Button variant="secondary" onClick={() => setSheetBottom(true)}>
          Bottom sheet
        </Button>
        <Button variant="secondary" onClick={() => setSheetStart(true)}>
          Start sheet (flips in RTL)
        </Button>
      </div>

      <form
        action={() =>
          toast({ title: 'Submitted', description: 'The demo form went through.', tone: 'success' })
        }
        className="flex flex-wrap gap-3"
      >
        <ConfirmSubmit
          title="Delete this thing?"
          description="ConfirmSubmit replaces window.confirm: an alert dialog gates the form submit."
          confirmLabel="Delete"
          destructive
        >
          ConfirmSubmit (destructive)
        </ConfirmSubmit>
      </form>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() =>
            toast({
              title: 'Booking confirmed',
              description: 'GH-4F7K2M is ready.',
              tone: 'success',
            })
          }
        >
          Success toast
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast({ title: 'Payment failed', description: 'The card was declined.', tone: 'error' })
          }
        >
          Error toast
        </Button>
        <Button variant="secondary" onClick={() => toast({ title: 'Heads up', tone: 'info' })}>
          Info toast
        </Button>
      </div>

      <Sheet open={sheetBottom} onOpenChange={setSheetBottom} side="bottom" title="Bottom sheet">
        <p className="text-sarat-black-600 text-sm">
          Springs up from the bottom edge (BRIEF §3). Swipe-free, tap the backdrop or Esc to close.
        </p>
      </Sheet>
      <Sheet open={sheetStart} onOpenChange={setSheetStart} side="start" title="Start sheet">
        <p className="text-sarat-black-600 text-sm">
          Slides from the inline-start edge — from the right in Arabic. Used by the admin drawer.
        </p>
      </Sheet>
    </div>
  );
}
