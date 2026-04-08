import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['tests/**/*.test.js'],
        coverage: {
            provider: 'v8',
            include: ['static/js/**/*.js'],
            exclude: ['node_modules/**'],
        },
    },
})
