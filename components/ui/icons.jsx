// Small line icons used across the storefront. Decorative: always paired with a text label
// or an aria-label on the control.
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export function SearchIcon(props) {
  return <svg {...base} {...props}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></svg>;
}
export function HeartIcon({ filled = false, ...props }) {
  return (
    <svg {...base} {...props} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.2 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />
    </svg>
  );
}
export function BagIcon(props) {
  return <svg {...base} {...props}><path d="M5 8h14l-1 13H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>;
}
export function UserIcon(props) {
  return <svg {...base} {...props}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" /></svg>;
}
export function MenuIcon(props) {
  return <svg {...base} {...props}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
}
export function ChevronIcon(props) {
  return <svg {...base} width={16} height={16} {...props}><path d="m6 9 6 6 6-6" /></svg>;
}
