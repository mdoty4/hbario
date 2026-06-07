#!/bin/bash
# Deploy Open Hedera Agent to Vercel
# Prerequisites:
#   1. Install Vercel CLI: npm i -g vercel
#   2. Login to Vercel: vercel login
#   3. Have a GitHub repo set up
#
# Usage:
#   ./deploy.sh          # Deploy to preview
#   ./deploy.sh --prod   # Deploy to production

set -e

echo "🚀 Deploying Open Hedera Agent..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Install with: npm i -g vercel"
    exit 1
fi

# Check if logged in
if ! vercel whoami &> /dev/null; then
    echo "❌ Not logged in to Vercel. Run: vercel login"
    exit 1
fi

# Run Prisma generate
echo "📦 Generating Prisma client..."
npx prisma generate

# Build
echo "🏗️  Building project..."
npm run build

# Deploy
if [ "$1" = "--prod" ]; then
    echo "🌐 Deploying to production..."
    vercel --prod --confirm
else
    echo "🌐 Deploying to preview..."
    vercel --confirm
fi

echo "✅ Deployment complete!"
echo "📋 Check your Vercel dashboard for the deployment URL."
