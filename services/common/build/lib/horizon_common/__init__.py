"""Shared building blocks for the Horizon Travel microservices.

Every service imports from here so that configuration, authentication,
error format, logging, events and storage behave identically across the
fleet. Each service still owns its own database schema and API.
"""
