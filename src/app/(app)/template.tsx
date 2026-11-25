/** Re-mounts on every navigation inside the app, so the new page fades in softly. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
