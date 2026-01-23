
export function MainWrapper(props: { children: React.ReactNode }) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-20">
      {props.children}
    </div>
  );
}