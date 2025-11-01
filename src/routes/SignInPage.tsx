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
    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) {
      if (error.message.toLowerCase().includes('invalid')) {
        // Attempt to create the admin user automatically
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
      }
      return toast.error(error.message)
    }
    toast.success('Signed in')
    navigate(redirectTo, { replace: true })
  }

  return (
    <div className="min-h-screen w-full bg-muted/20 py-12">
      <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 sm:px-6">
        <Card className="w-full shadow-lg">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-primary">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                <IconBrand size={18} />
              </span>
              <div>
                <CardTitle className="text-xl">Welcome back</CardTitle>
                <CardDescription>Sign in to access your workspace</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  {...register('email')}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  {...register('password')}
                />
                {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting || !supabaseReady}>
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            {!supabaseReady && (
              <div className="rounded-md border border-dashed border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {missingSupabaseEnvMessage}
              </div>
            )}

            <div className="flex flex-col gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium text-foreground">Need a quick demo?</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
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
