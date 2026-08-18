### LNST Portal

Operations and portal platform for Lakshmi NeuroSpine Technologies.

Serves everything under `/lnst`:

- `/lnst/login` — terminal sign-in, and the owner of the session contract
  (`public/js/lnst_session.js`).
- `/lnst` — operations overview and the directory of every screen.
- `/lnst/<screen>` — the field-executive, warehouse and back-office screens,
  declared in `www/lnst/__init__.py` and rendered from `templates/lnst_base.html`.

Still a front-end mockup: no DocTypes and no API. Screen state comes from
`public/js/mock_data.js` and lives in localStorage.

### Installation

You can install this app using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO --branch develop
bench install-app lnst_portal
```

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/lnst_portal
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

### License

mit
# A3-Surgiware
