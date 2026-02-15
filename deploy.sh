#!/bin/bash

# YMU Gala 2026 - Quick Deployment Script
# Deploys to GitHub Pages at https://zach992.github.io/ymu-gala-2026/

# Check if commit message was provided
if [ -z "$1" ]; then
    echo "❌ Error: Please provide a commit message"
    echo "Usage: ./deploy.sh \"Your commit message\""
    exit 1
fi

echo "🚀 Deploying YMU Gala 2026..."
echo ""

# Remove any git lock files
if [ -f .git/index.lock ]; then
    echo "🔧 Removing git lock file..."
    rm -f .git/index.lock
fi

if [ -f .git/HEAD.lock ]; then
    rm -f .git/HEAD.lock
fi

# Stage all changes
echo "📦 Staging changes..."
git add -A

# Commit with provided message
echo "💾 Committing: $1"
git commit -m "$1"

# Push to GitHub
echo "⬆️  Pushing to GitHub..."
git push origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully deployed!"
    echo ""
    echo "🌐 Live site: https://zach992.github.io/ymu-gala-2026/"
    echo "⏱️  Changes will appear in 1-2 minutes"
else
    echo ""
    echo "❌ Push failed - check your connection and try again"
    exit 1
fi
