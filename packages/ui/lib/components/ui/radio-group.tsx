import * as React from 'react';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { Radio as RadioPrimitive } from '@base-ui/react/radio';

import { cn } from '../../utils';

/** shadcn/ui radio group on Base UI, colored by the theme tokens. */
const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupPrimitive.Props>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive ref={ref} data-slot="radio-group" className={cn('grid gap-2', className)} {...props} />
));
RadioGroup.displayName = 'RadioGroup';

const RadioGroupItem = React.forwardRef<HTMLElement, RadioPrimitive.Root.Props>(({ className, ...props }, ref) => (
  <RadioPrimitive.Root
    ref={ref}
    data-slot="radio-group-item"
    className={cn(
      'inline-flex aspect-square size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-input bg-background text-primary shadow-sm outline-none transition-[border-color,box-shadow]',
      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'data-[checked]:border-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <RadioPrimitive.Indicator data-slot="radio-group-indicator" className="size-2 rounded-full bg-primary" />
  </RadioPrimitive.Root>
));
RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };
