import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { IconBrand } from '../components/icons'
import { Label } from '../components/ui/label'
import { supabase, isSupabaseConfigured, missingSupabaseEnvMessage } from '../lib/supabaseClient'
import { useNavigate, useLocation, type Location } from 'react-router-dom'
import { toast } from 'sonner'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

type FormValues = z.infer<typeof schema>
type LocationState = { from?: string }

export default function SignInPage() {
  const navigate = useNavigate()
  const location = useLocation() as Location & { state?: LocationState }
  const redirectTo = location.state?.from || '/dashboard'
  const supabaseReady = isSupabaseConfigured

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: 'admin@gmail.com', password: 'admin@123' },
  })

  const onSubmit = async (values: FormValues) => {
    if (!supabaseReady) {
      toast.error(missingSupabaseEnvMessage)
      return
    }
    try {
      const { error } = await supabase.auth.signInWithPassword(values)
      if (error) {
        if (error.message.toLowerCase().includes('invalid')) {
          // Attempt to create the admin user automatically
          try {
            const { error: signupErr } = await supabase.auth.signUp({
              email: values.email,
              password: values.password,
              options: { data: { full_name: 'Admin' } },
            })
            if (signupErr) {
              return toast.error(
                `${signupErr.message}. Create this user in Supabase Auth (Users) and mark as confirmed, then try again.`
              )
            }
            return toast.info(
              'Admin user created. If email confirmation is required, confirm the email in Supabase or disable confirmations, then sign in again.'
            )
          } catch (signupError: any) {
            return toast.error(signupError?.message || 'Failed to create user')
          }
        }
        return toast.error(error.message)
      }
      toast.success('Signed in')
      navigate(redirectTo, { replace: true })
    } catch (err: any) {
      // Handle network errors or other unexpected errors
      const errorMessage = err?.message || 'Failed to sign in. Please check your connection and try again.'
      toast.error(errorMessage)
      // eslint-disable-next-line no-console
      if (import.meta.env.DEV) console.error('Sign in error:', err)
    }
  }

  // Early return with helpful message if Supabase is not configured
  if (!supabaseReady) {
    return (
      <div className="min-h-screen w-full bg-muted/20 flex items-center justify-center py-8 px-4 sm:py-12 sm:px-6">
        <div className="w-full max-w-md mx-auto">
          <Card className="w-full shadow-xl">
            <CardHeader className="text-center space-y-2 pb-6">
              <div className="flex items-center justify-center gap-3 text-primary mb-2">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <IconBrand size={20} />
                </span>
                <div className="text-left">
                  <CardTitle className="text-xl sm:text-2xl font-bold">Configuration Required</CardTitle>
                  <CardDescription className="text-sm sm:text-base mt-1">
                    Supabase setup incomplete
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border-2 border-dashed border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive text-center">
                <p className="font-medium mb-2">{missingSupabaseEnvMessage}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  For Vercel: Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Environment Variables.
                  <br />
                  For Electron: Ensure env vars are set in .env file before building.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-muted/20 flex items-center justify-center py-8 px-4 sm:py-12 sm:px-6">
      <div className="w-full max-w-md mx-auto">
        <Card className="w-full shadow-xl">
          <CardHeader className="text-center space-y-2 pb-6">
            <div className="flex items-center justify-center gap-3 text-primary mb-2">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <IconBrand size={20} />
              </span>
              <div className="text-left">
                <CardTitle className="text-xl sm:text-2xl font-bold">Welcome back</CardTitle>
                <CardDescription className="text-sm sm:text-base mt-1">
                  Sign in to access your workspace
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-left">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-sm text-destructive font-medium mt-1">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-left">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="w-full"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-sm text-destructive font-medium mt-1">{errors.password.message}</p>
                )}
              </div>
              <Button 
                type="submit" 
                className="w-full mt-6" 
                disabled={isSubmitting || !supabaseReady}
                size="lg"
              >
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="font-semibold text-foreground text-center sm:text-left">
                Need a quick demo?
              </span>
              <Button
                type="button"
                variant="outline"
                size="default"
                className="w-full sm:w-auto"
                disabled={isSubmitting || !supabaseReady}
                onClick={() => {
                  setValue('email', 'admin@gmail.com', { shouldValidate: true })
                  setValue('password', 'admin@123', { shouldValidate: true })
                  if (supabaseReady) {
                    void onSubmit({ email: 'admin@gmail.com', password: 'admin@123' })
                  } else {
                    toast.error(missingSupabaseEnvMessage)
                  }
                }}
              >
                Sign in as Admin
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
