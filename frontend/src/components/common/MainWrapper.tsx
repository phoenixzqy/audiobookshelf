
export function MainWrapper(props: { children: React.ReactNode, className?: string }) {
  return (
    <main className={`max-w-7xl mx-auto px-4 py-8 ${props.className || ''}`}>
      {props.children}
    </main>
  );
}