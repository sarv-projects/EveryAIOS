import { z } from 'zod';

export const imageGenerationTool = {
  name: 'generate_image',
  description: 'Generate an AI image from a text prompt using DALL-E, Stable Diffusion, etc. Requires a connected image provider API key.',
  schema: z.object({
    prompt: z.string().describe('Detailed description of the image to generate'),
    style: z.enum(['realistic', 'artistic', 'cartoon', 'logo']).optional().describe('Visual style'),
    size: z.enum(['square', 'wide', 'tall']).optional().describe('Image aspect ratio'),
  }),
  // External network write-ish side effect (generation) — use external-write risk.
  risk: 'external-write' as const,
};

export const imageEditingTool = {
  name: 'edit_image',
  description: 'Edit or transform an existing image based on a text description.',
  schema: z.object({
    prompt: z.string().describe('Description of the desired edit'),
    sourceUri: z.string().describe('File URI of the image to edit'),
  }),
  risk: 'external-write' as const,
};
