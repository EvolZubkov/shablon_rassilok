# Project Rules

## UI Spacing And Sizing

This project uses a strict `4px` grid for all UI work.

Mandatory rules:

- Every spacing value must be a multiple of `4px`.
- Every size value must be a multiple of `4px`.
- This applies to `margin`, `padding`, `gap`, `width`, `height`, `min-width`, `min-height`, `border-radius`, positioning offsets, and any other visual dimensions.
- Values such as `6px`, `10px`, `14px`, `18px`, `38px` and any other non-multiples of `4px` are forbidden in UI code.
- Elements must never visually touch each other. Adjacent controls must have an explicit gap.
- The spacing between neighboring UI elements is `4px` unless a task explicitly says otherwise.
- Button wrapping "as it happens" is forbidden. Multi-button layouts must use an explicit grid or another deterministic layout.

Acceptance criteria for any UI task:

1. No non-multiple-of-4 pixel values remain in the edited UI scope.
2. Neighboring controls use explicit `4px` spacing unless the task explicitly defines another value.
3. No accidental or chaotic button wrapping remains.
4. If any of these rules are violated, the UI task is not complete.

When there is a conflict between an existing local style and this rule, this rule wins.
