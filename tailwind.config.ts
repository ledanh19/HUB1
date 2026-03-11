import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx,json}"],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		fontFamily: {
  			sans: [
  				'ui-sans-serif',
  				'system-ui',
  				'sans-serif',
  				'Apple Color Emoji',
  				'Segoe UI Emoji',
  				'Segoe UI Symbol',
  				'Noto Color Emoji'
  			],
  			serif: [
  				'ui-serif',
  				'Georgia',
  				'Cambria',
  				'Times New Roman',
  				'Times',
  				'serif'
  			],
  			mono: [
  				'ui-monospace',
  				'SFMono-Regular',
  				'Menlo',
  				'Monaco',
  				'Consolas',
  				'Liberation Mono',
  				'Courier New',
  				'monospace'
  			]
  		},
  		fontSize: {
  			micro: [
  				'0.625rem',
  				{
  					lineHeight: '1rem'
  				}
  			],
  			caption: [
  				'0.75rem',
  				{
  					lineHeight: '1rem'
  				}
  			],
  			body: [
  				'0.875rem',
  				{
  					lineHeight: '1.25rem'
  				}
  			],
  			section: [
  				'1rem',
  				{
  					lineHeight: '1.375rem'
  				}
  			],
  			page: [
  				'1.125rem',
  				{
  					lineHeight: '1.5rem'
  				}
  			],
  			kpi: [
  				'1.5rem',
  				{
  					lineHeight: '1.875rem'
  				}
  			],
  			heroKpi: [
  				'1.875rem',
  				{
  					lineHeight: '2.25rem'
  				}
  			]
  		},
  		colors: {
  			border: 'hsl(var(--border))',
  			'border-default': 'hsl(var(--border-default))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))',
  				hover: 'hsl(var(--primary-hover))',
  				active: 'hsl(var(--primary-active))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))',
  				hover: 'hsl(var(--destructive-hover))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			success: {
  				DEFAULT: 'hsl(var(--success))',
  				foreground: 'hsl(var(--success-foreground))',
  				lime: 'hsl(var(--success-lime))'
  			},
  			warning: {
  				DEFAULT: 'hsl(var(--warning))',
  				foreground: 'hsl(var(--warning-foreground))'
  			},
  			info: {
  				DEFAULT: 'hsl(var(--info))',
  				foreground: 'hsl(var(--info-foreground))'
  			},
  			danger: {
  				DEFAULT: 'hsl(var(--danger))',
  				foreground: 'hsl(var(--danger-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			finance: {
  				payable: 'hsl(var(--finance-payable))',
  				paid: 'hsl(var(--finance-paid))',
  				'deposit-held': 'hsl(var(--finance-deposit-held))',
  				'prepaid-pending': 'hsl(var(--finance-prepaid-pending))',
  				applied: 'hsl(var(--finance-applied))',
  				zero: 'hsl(var(--finance-zero))',
  				'host-collected': 'hsl(var(--finance-host-collected))'
  			},
  			aging: {
  				'0-7': 'hsl(var(--aging-0-7))',
  				'8-14': 'hsl(var(--aging-8-14))',
  				'15-30': 'hsl(var(--aging-15-30))',
  				'over-30': 'hsl(var(--aging-over-30))'
  			},
  			ota: {
  				booking: 'hsl(var(--ota-booking))',
  				agoda: 'hsl(var(--ota-agoda))',
  				expedia: 'hsl(var(--ota-expedia))',
  				airbnb: 'hsl(var(--ota-airbnb))',
  				traveloka: 'hsl(var(--ota-traveloka))'
  			},
  			status: {
  				neutral: 'hsl(var(--status-neutral))',
  				'neutral-bg': 'hsl(var(--status-neutral-bg))',
  				info: 'hsl(var(--status-info))',
  				'info-bg': 'hsl(var(--status-info-bg))',
  				warning: 'hsl(var(--status-warning))',
  				'warning-bg': 'hsl(var(--status-warning-bg))',
  				danger: 'hsl(var(--status-danger))',
  				'danger-bg': 'hsl(var(--status-danger-bg))',
  				success: 'hsl(var(--status-success))',
  				'success-bg': 'hsl(var(--status-success-bg))',
  				pending: 'hsl(var(--status-pending))',
  				confirmed: 'hsl(var(--status-confirmed))',
  				'checked-in': 'hsl(var(--status-checked-in))',
  				'checked-out': 'hsl(var(--status-checked-out))',
  				paid: 'hsl(var(--status-paid))',
  				cancelled: 'hsl(var(--status-cancelled))',
  				'no-show': 'hsl(var(--status-no-show))'
  			},
  			nav: {
  				DEFAULT: 'hsl(var(--nav-background))',
  				foreground: 'hsl(var(--nav-foreground))',
  				border: 'hsl(var(--nav-border))',
  				hover: 'hsl(var(--nav-hover))',
  				active: 'hsl(var(--nav-active))',
  				'active-bg': 'hsl(var(--nav-active-bg))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			kpi: {
  				value: 'hsl(var(--kpi-value))',
  				label: 'hsl(var(--kpi-label))'
  			},
  			text: {
  				primary: 'hsl(var(--text-primary))',
  				secondary: 'hsl(var(--text-secondary))',
  				muted: 'hsl(var(--text-muted))',
  				disabled: 'hsl(var(--text-disabled))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  			xl: 'calc(var(--radius) + 2px)'
  		},
  		boxShadow: {
  			subtle: '0 1px 2px 0 hsl(var(--shadow-color) / 0.04), 0 2px 4px -1px hsl(var(--shadow-color) / 0.06)',
  			card: '0 1px 3px 0 hsl(var(--shadow-color) / 0.04), 0 4px 8px -2px hsl(var(--shadow-color) / 0.08)',
  			elevated: '0 4px 12px -4px hsl(var(--shadow-color) / 0.08), 0 8px 24px -8px hsl(var(--shadow-color) / 0.12)',
  			modal: '0 8px 32px -8px hsl(var(--shadow-color) / 0.15), 0 16px 48px -16px hsl(var(--shadow-color) / 0.2)',
  			'2xs': 'var(--shadow-2xs)',
  			xs: 'var(--shadow-xs)',
  			sm: 'var(--shadow-sm)',
  			md: 'var(--shadow-md)',
  			lg: 'var(--shadow-lg)',
  			xl: 'var(--shadow-xl)',
  			'2xl': 'var(--shadow-2xl)'
  		},
  		transitionTimingFunction: {
  			motion: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  			'motion-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
  			'motion-in': 'cubic-bezier(0, 0, 0.2, 1)'
  		},
  		transitionDuration: {
  			micro: '80ms',
  			fast: '120ms',
  			normal: '150ms',
  			medium: '180ms',
  			slow: '240ms'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0',
  					opacity: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)',
  					opacity: '1'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)',
  					opacity: '1'
  				},
  				to: {
  					height: '0',
  					opacity: '0'
  				}
  			},
  			'fade-in': {
  				from: {
  					opacity: '0'
  				},
  				to: {
  					opacity: '1'
  				}
  			},
  			'fade-out': {
  				from: {
  					opacity: '1'
  				},
  				to: {
  					opacity: '0'
  				}
  			},
  			'fade-in-up': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(8px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			'scale-in': {
  				from: {
  					transform: 'scale(0.96)',
  					opacity: '0'
  				},
  				to: {
  					transform: 'scale(1)',
  					opacity: '1'
  				}
  			},
  			'scale-out': {
  				from: {
  					transform: 'scale(1)',
  					opacity: '1'
  				},
  				to: {
  					transform: 'scale(0.96)',
  					opacity: '0'
  				}
  			},
  			emphasis: {
  				'0%': {
  					transform: 'scale(1)'
  				},
  				'50%': {
  					transform: 'scale(1.03)'
  				},
  				'100%': {
  					transform: 'scale(1)'
  				}
  			},
  			'slide-in-right': {
  				from: {
  					transform: 'translateX(100%)'
  				},
  				to: {
  					transform: 'translateX(0)'
  				}
  			},
  			'slide-out-right': {
  				from: {
  					transform: 'translateX(0)'
  				},
  				to: {
  					transform: 'translateX(100%)'
  				}
  			},
  			'slide-in-left': {
  				from: {
  					transform: 'translateX(-100%)'
  				},
  				to: {
  					transform: 'translateX(0)'
  				}
  			},
  			'slide-in-up': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(16px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			'slide-in-down': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(-16px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			shimmer: {
  				'0%': {
  					backgroundPosition: '-200% 0'
  				},
  				'100%': {
  					backgroundPosition: '200% 0'
  				}
  			},
  			shake: {
  				'0%, 100%': {
  					transform: 'translateX(0)'
  				},
  				'25%': {
  					transform: 'translateX(-4px)'
  				},
  				'75%': {
  					transform: 'translateX(4px)'
  				}
  			},
  			'success-check': {
  				from: {
  					transform: 'scale(0)',
  					opacity: '0'
  				},
  				to: {
  					transform: 'scale(1)',
  					opacity: '1'
  				}
  			},
  			'count-up': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(6px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			highlight: {
  				'0%': {
  					backgroundColor: 'hsl(var(--primary) / 0.15)'
  				},
  				'100%': {
  					backgroundColor: 'transparent'
  				}
  			},
  			'notification-flash': {
  				'0%, 100%': {
  					backgroundColor: 'rgb(254 243 199)'
  				},
  				'50%': {
  					backgroundColor: 'rgb(253 230 138)'
  				}
  			},
  			'progress-indeterminate': {
  				'0%': {
  					transform: 'translateX(-100%)'
  				},
  				'100%': {
  					transform: 'translateX(100%)'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  			'accordion-up': 'accordion-up 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  			'fade-in': 'fade-in 150ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  			'fade-out': 'fade-out 120ms cubic-bezier(0.4, 0, 0.2, 1)',
  			'fade-in-up': 'fade-in-up 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  			'scale-in': 'scale-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  			'scale-out': 'scale-out 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  			'slide-in-right': 'slide-in-right 240ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  			'slide-out-right': 'slide-out-right 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  			'slide-in-left': 'slide-in-left 240ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  			'slide-in-up': 'slide-in-up 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  			'slide-in-down': 'slide-in-down 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  			emphasis: 'emphasis 300ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  			shake: 'shake 100ms ease-in-out',
  			success: 'success-check 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  			highlight: 'highlight 1200ms ease-out',
  			shimmer: 'shimmer 1500ms linear infinite',
  			progress: 'progress-indeterminate 1200ms cubic-bezier(0.4, 0, 0.6, 1) infinite',
  			'count-up': 'count-up 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  			enter: 'fade-in 150ms cubic-bezier(0.2, 0.8, 0.2, 1), scale-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  			exit: 'fade-out 120ms cubic-bezier(0.4, 0, 0.2, 1), scale-out 150ms cubic-bezier(0.4, 0, 0.2, 1)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
