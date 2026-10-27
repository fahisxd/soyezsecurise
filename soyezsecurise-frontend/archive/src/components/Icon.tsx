export type IconName = 'grid' | 'folder' | 'terminal' | 'bookmark' | 'search' | 'arrow' | 'up' | 'down' | 'flip' | 'link' | 'external' | 'close' | 'shuffle' | 'file';
const paths: Record<IconName, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  folder: <path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3Z"/>,
  terminal: <><path d="m4 6 6 6-6 6m9 0h7"/></>,
  bookmark: <path d="M6 3h12v18l-6-4-6 4Z"/>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  up: <path d="m6 14 6-6 6 6"/>, down: <path d="m6 10 6 6 6-6"/>,
  flip: <><path d="M3 9h15l-4-4m7 10H6l4 4"/><path d="M18 9a7 7 0 0 1 3 6M6 15a7 7 0 0 1-3-6"/></>,
  link: <><path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0m0 2 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0)"/></>,
  external: <><path d="M14 3h7v7m0-7L10 14m0-10H3v17h17v-7"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  shuffle: <><path d="m3 5 4 0 10 14h4m-4-4 4 4-4 3M3 19h4L17 5h4m-4-3 4 3-4 4"/></>,
  file: <><path d="M5 3h9l5 5v13H5Zm9 0v6h5M8 13h8m-8 4h5"/></>,
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
