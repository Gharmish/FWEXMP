export default function LocaleLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24" aria-busy="true">
      <div className="flex max-w-3xl flex-col gap-6">
        <div className="bg-sarat-black/8 rounded-button h-3 w-24 animate-pulse" />
        <div className="flex flex-col gap-3">
          <div className="bg-sarat-black/8 rounded-input h-12 w-full max-w-2xl animate-pulse" />
          <div className="bg-sarat-black/8 rounded-input h-12 w-full max-w-xl animate-pulse" />
        </div>
        <div className="bg-sarat-black/8 rounded-button h-5 w-full max-w-lg animate-pulse" />
      </div>
      <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="rounded-card border-sarat-black/8 flex min-h-64 flex-col gap-4 [border-width:0.5px] p-6"
          >
            <div className="bg-sarat-black/8 rounded-button h-3 w-28 animate-pulse" />
            <div className="bg-sarat-black/8 rounded-input h-8 w-4/5 animate-pulse" />
            <div className="flex flex-col gap-2">
              <div className="bg-sarat-black/8 rounded-button h-4 w-full animate-pulse" />
              <div className="bg-sarat-black/8 rounded-button h-4 w-5/6 animate-pulse" />
              <div className="bg-sarat-black/8 rounded-button h-4 w-2/3 animate-pulse" />
            </div>
            <div className="bg-sarat-black/8 rounded-button mt-auto h-4 w-1/2 animate-pulse" />
          </div>
        ))}
      </div>
    </section>
  );
}
