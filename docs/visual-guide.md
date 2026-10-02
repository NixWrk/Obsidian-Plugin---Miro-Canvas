# Наглядное руководство / Visual guide

Проверено 3 октября 2026 года в отдельном Obsidian 1.13.7 на Windows.

## Что показано

В [русском README](../README.ru.md) и [английском README](../README.md)
размещены 14 примеров, по одной записи для каждого языка. Сценарии находятся
в [`tools/obsidian_cdp/scenarios`](../tools/obsidian_cdp/scenarios).
Все 28 GIF вместе занимают около 7 МБ; каждый файл меньше 1 МБ.

| Запись | Что видно в ролике |
| --- | --- |
| `sticky-with-note` | Создание стикера рядом с настоящей заметкой и стрелка между ними |
| `insert-note` | Выбор существующей заметки из хранилища и добавление на доску |
| `obsidian-links` | Ввод ссылки и встраивания, содержимое заметки и переход к оригиналу |
| `nested-canvas` | Превью другого Canvas и открытие самой доски |
| `create-shape` | Выбор ромба, создание перетаскиванием и ввод вопроса |
| `frame-group` | Перенос фрейма за название вместе с двумя задачами |
| `select-together` | Выделение двух карточек рамкой и перенос вместе со связью |
| `format-card` | Смена шрифта и заливки карточки |
| `move-connected` | Стрелка следует за карточкой, отмена возвращает их на место |
| `draw-and-erase` | Красный штрих пером и его удаление ластиком |
| `comment-thread` | Вопрос, ответ и отметка «решено» |
| `board-search` | Поиск и переход к карточке за пределами текущего вида |
| `export-pages` | Книжная ориентация, страницы по фреймам, PDF/PPTX и открытие PDF |
| `arrange-panels` | Перенос панели инструментов и поворот столбцом |

## Насколько понятно

Каждый ролик показывает одну небольшую задачу. Курсор плавно подходит к
кнопке, перед нажатием есть короткая пауза, после результата — время для
чтения. Подписи говорят о действии и результате обычными словами.
Русские и английские записи используют один сценарий, но язык интерфейса,
текст заметок и подписи соответствуют своему README.

В начале README открыта только запись со стикером и заметкой. Остальные
примеры раскрываются возле описания функции. Это позволяет читать страницу
без множества одновременно видимых анимаций. Текстовые инструкции остаются
понятны и без просмотра GIF.

Записи имеют размер 960 × 600. Основная часть длится около 8–15 секунд;
обсуждение и экспорт длиннее, потому что надо успеть прочитать сообщения и
увидеть готовый файл. На узком экране надписи внутри интерфейса мелкие:
для подробного просмотра лучше открыть GIF в полном размере. В README
добавлена такая подсказка. Это просмотр записи с компьютера, а не проверка
работы на телефоне.

Проверка — просмотр начала, середины и конца каждого ролика, а также
проверки результатов внутри сценариев. Проверяются созданные карточки,
связи, сохранённое оформление, переходы к файлам, перемещения, отмена,
поиск и решение комментария. PDF и PPTX созданы настоящим экспортом:
отдельно проверены две страницы PDF и два слайда PPTX. PowerPoint как
приложение в ролике не открывается: показано сохранение и затем PDF.
Это оценка автора записей; проверка с новыми пользователями ещё не проведена.
В локальном просмотре Markdown также проверены раскрытие всех примеров и
ширина страницы при окне 390 px. Это не проверка мобильного приложения
Obsidian и не снимок страницы GitHub.

## Что улучшено после просмотра

- Увеличены подписи; убран случайный первый кадр от предыдущей доски.
- Курсор после действия уходит на пустое место, чтобы подсказка миникарты
  не закрывала результат.
- Ромб создаётся крупнее, чтобы вопрос внутри не разбивался на мелкие строки.
- Панель после переноса не перекрывает текст демонстрационной карточки.
- Вложенный Canvas показан вместе с переходом к оригиналу. В README
  поясняется, что в его небольшом превью нет текста карточек.
- Добавлены примеры `[[ссылок]]` и `![[встраиваний]]`, объяснение одного
  общего файла заметки и порядок открытия ссылки из карточки.
- Исправлена ошибка экспорта: отдельно расположенная миникарта попадала
  в страницы. Подписи и курсор записи теперь тоже исключаются из снимка.
- Для высоких фреймов выбрана книжная ориентация, чтобы в страницу не
  попадал соседний фрейм и целиком помещался заголовок.
- В финале экспорта PDF подогнан по высоте окна: видна вся первая страница.
  Под роликом доступны настоящие PDF и PPTX, чтобы проверить результат.
- Возле экспорта поясняется, что страницы и слайды — изображения доски,
  а не набор отдельно редактируемых фигур и текстовых блоков.

## Что ещё не показано

Задача `FUT-012` остаётся открытой: эта серия не заменяет весь список функций
и настроек. Четыре прежние записи (`tool-bar`, `text`, `shapes`, `frames`)
сохранены как черновики и не используются в новых разделах README.

Следующими полезнее всего записать:

1. Поворот, изменение размера, копирование между досками, слои и блокировку.
2. Виды стрелок, свободные концы, изгибы и подписи; маркер, умное рисование
   и частичный ластик.
3. Создание и название фрейма; код, таблицы, картинки и другие файлы;
   ссылки на заголовок и блок заметки.
4. Масштаб и переход через миникарту, привязки, темы и выбор своих инструментов.
5. Импорт настоящей доски Miro, выключение плагина и сохранность обычного Canvas.
6. Шрифты, первый запуск и отдельные настройки из списка в README.

Записи с пальцем, настоящим пером, силой нажатия и ладонью **не сделаны**.
Для них нужны настоящие устройства. Здесь нет записей macOS/Linux и
телефона/планшета; серия не выдаётся за проверку всех ОС и устройств.
Новая доска знакомства пока остаётся отдельной согласованной задачей.

## English review

Fourteen focused demonstrations are embedded in both READMEs. The table
above lists their scenario names and exact coverage. They show real input
in isolated Obsidian 1.13.7 on Windows, with smooth pointer motion, gradual
typing, readable captions and a pause to inspect the result. One opening
GIF shows Miro-style sticky notes beside an actual Obsidian note. Other
recordings expand beside the relevant feature descriptions.
The 28 GIFs total about 7 MB; each file is under 1 MB.

The GIFs are 960 × 600. Most last roughly 8–15 seconds; comments and export
take longer to leave time for reading and the completed output. Small
controls need full-size viewing on a narrow screen. Start, middle and end
frames were reviewed, and scenarios assert their actual results. This is
an author review, not a usability study with first-time users.
All example sections also opened correctly in a local Markdown preview;
its 390 px layout fitted without horizontal overflow. That preview is not
a GitHub screenshot or a mobile Obsidian test.

Review led to larger captions, removal of stale opening frames and minimap
hover hints, a larger decision shape, better panel placement, and a clearer
Canvas embed demonstration that also opens the original board. Documentation
now explains Obsidian links and embeds, opening a link from a selected card,
and sharing the original note file. It also explains that PDF pages and
PowerPoint slides contain images of the board rather than editable card
objects. Portrait pages suit the tall sample frames without including the
neighbouring frame or clipping the title.
The final PDF view fits the page height, and both actual output files are
linked under the demonstration.

Actual PDF and PPTX exports were checked for two pages and two slides.
The GIF shows the saved PDF; it does not show PowerPoint running. Review
also caught and fixed the separately placed minimap leaking into export.
The recording overlay is excluded from export captures too.

`FUT-012` remains open. Rotation, resizing, cross-board copying, layers,
locking, advanced connectors, drawing variants, more file types, heading
and block links, navigation, snapping, themes, imports, plugin-off behaviour,
font packs, onboarding and individual settings still need recordings.
The older four recordings remain drafts. Physical touch, stylus pressure
and palm behaviour were not recorded; there are no macOS/Linux or mobile
recordings here. The revised welcome board remains a separate agreed task.

## Reproduce the review

After recording both languages:

```powershell
python tools/obsidian_cdp/audit_guide.py
node --test tools/obsidian_cdp/tests/cdp-key-events.test.mjs
python -m pytest -q tools/obsidian_cdp/tests tools/obsidian_oracle/tests
```

The audit checks both README references, scenario files, GIF dimensions,
looping, duration and the 4 MiB limit. It writes timing/size measurements
and contact sheets to `tools/obsidian_cdp/.out/guide-review/` for manual
inspection. This does not automatically judge readability.

The export scenario predetermines only the operating system's save location,
inside the isolated vault. Capture, PDF/PPTX encoding, writing and PDF viewing
use the actual plugin and Obsidian. The save-dialog function is restored
in cleanup, including after a failed scenario.
