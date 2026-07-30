import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-[21px] w-9 shrink-0 items-center rounded-full border border-transparent shadow-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-brand data-[state=unchecked]:bg-[#dfe2e8]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-[17px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18)] ring-0 transition-transform',
          'data-[state=checked]:translate-x-[17px] data-[state=unchecked]:translate-x-[2px]',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
