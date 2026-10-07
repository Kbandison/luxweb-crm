import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  // `error` is set by /auth/callback ('callback': the link couldn't be
  // exchanged for a session) and by the proxy ('no_role': signed in, but
  // there's no CRM account behind the login).
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm linkError={error ?? null} />;
}
