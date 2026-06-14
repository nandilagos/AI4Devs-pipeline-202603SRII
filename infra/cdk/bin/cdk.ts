#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { LtiBackendStack } from '../lib/lti-backend-stack';

const app = new cdk.App();

// The stack uses Vpc.fromLookup (default VPC), which needs a concrete
// account + region to query AWS at deploy time. The account is taken from the
// AWS CLI credentials in scope (CDK_DEFAULT_ACCOUNT); the region is pinned to
// us-east-1 per the agreed plan.
//
// Vpc.fromLookup requires a CONCRETE account + region (not unresolved tokens),
// otherwise it throws StackAccountRegionNotSpecified. The account comes from the
// AWS CLI credentials in scope (CDK_DEFAULT_ACCOUNT). For a local `cdk synth`
// without credentials we fall back to a placeholder account so the stack stays
// concrete and synth can produce a template with dummy lookup values. A real
// `cdk deploy` always has CDK_DEFAULT_ACCOUNT set from your credentials, which
// overrides the placeholder.
const account = process.env.CDK_DEFAULT_ACCOUNT || '000000000000';
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';

new LtiBackendStack(app, 'LtiBackendStack', {
  env: { account, region },
  description: 'EC2 deploy target (Ubuntu 22.04 + Node 20 + PM2 + PostgreSQL 16) for the LTI backend',
});

app.synth();
