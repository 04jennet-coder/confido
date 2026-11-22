# Confido for Jira privacy notice

Confido is a read-only Forge app that assesses release readiness from Jira work items. This notice covers the Forge app, including its Rovo agent and MCP tools.

## Data used

When a user requests an assessment, Confido reads Jira work items that match the requested project, version, or JQL. It uses issue keys, summaries, descriptions, types, statuses, priorities, assignee presence, dates, labels, components, versions, issue links, estimates, and comments to calculate the score and explain the result. Jira fields and comment excerpts can contain personal information entered by Jira users.

## Processing and retention

Confido uses the invoking user's Jira permissions. It calculates the assessment in Atlassian Forge and returns it to the requesting Rovo or authorized MCP client. The Forge app has no app-owned database, does not persist Jira work items or assessment results, and does not call an external AI provider.

Atlassian manages its platform logs and Rovo chat history. If a site admin enables external MCP tools and a user connects an MCP client, that client receives the outputs requested by the user. Its own privacy and retention policies apply to those outputs. Review the client's policies before authorizing it to process Jira information.

## Contact

For questions, use the [Confido project repository](https://github.com/04jennet-coder/confido). Keep Jira content and personal information out of public support requests.
