/**
 * Layout for auth routes (`/sign-in`, future `/sign-out-confirmation`,
 * etc.). The parent locale layout already provides navbar + footer; this
 * group exists so we can share centring + max-width without each auth
 * page repeating the wrapper. Pure structural — no chrome of its own.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16 sm:py-24">
      {children}
    </div>
  );
}
