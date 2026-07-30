import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold', {
  variants: {
    variant: {
      brand: 'bg-brand-soft text-brand-hover',
      danger: 'bg-danger-soft text-danger',
      warning: 'bg-warning-soft text-warning-text',
      success: 'bg-success-soft text-success',
      neutral: 'bg-divider text-muted',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export interface BadgeProps extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
