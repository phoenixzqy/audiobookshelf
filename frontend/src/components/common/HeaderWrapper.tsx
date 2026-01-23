import { ReactNode } from 'react';

export function HeaderWrapper(props: { children: ReactNode }) {
  return (
    <header className="bg-gray-800 shadow-lg fixed top-0 w-full z-50">
      {props.children}
    </header>
  );
}