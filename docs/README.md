# Documentation

Four documents, each answering one question:

| Document | Question it answers |
|---|---|
| [language.md](language.md) | Which language does the model write in, and where exactly? |
| [rules.md](rules.md) | What is in the prompt section, and what is a rule? |
| [measurement.md](measurement.md) | How is a rule measured, and what may the numbers claim? |
| [architecture.md](architecture.md) | How is the plugin put together? |

The Russian README is [../README.ru.md](../README.ru.md); the English one is
[../README.md](../README.md).

These documents describe behavior the code enforces or the prompt requests. When
a document and the catalogue disagree, [`lib/catalogue.js`](../lib/catalogue.js)
is right and the document is the bug.
