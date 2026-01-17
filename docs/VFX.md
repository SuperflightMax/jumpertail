# VFX / PARTICLES

– простая particle system
– эффекты отдельными файлами
– можно использовать PNG формы
– есть глубина / параллакс

Codex обязан описывать
что и как он реализовал.

## Реализация

- Партиклы создаются при прыжке с платформы как burst.
- Партиклы управляются через отдельный `particlesystem.js` с пулом для высокой плотности эффектов.
- Эффекты вынесены в отдельные скрипты: `particletail.js` (layered tail) и `particleplatform.js` (burst платформы).
- Хвост — многослойный поток частиц (follow/aura/spark) с независимыми параметрами, цветовой логикой и общей интенсивностью.
- Частицы хвоста могут быть снапнуты к grid-сетке для dot-matrix / pixel ощущений.
- Параметры хвоста и платформы настраиваются в `config.js` (слои, скорость спавна, жизнь, размер, формы, цвета).
- Параллакс реализован фоновыми слоями с точками, двигающимися медленнее камеры.

## Layered Tail (Tail v2)

Настройки в `config.js` → `particles.tail`:

- `snapToGrid`, `gridSize` — снап к сетке.
- `growthPerJump` — прирост интенсивности за прыжок.
- `globalAlpha`, `globalSpawnMul`, `globalLifeMul`, `globalSizeMul` — общие множители.
- `progressStages` — таблица прогресса (по `intensity`) для множителей spawn/life/size.
- `layers[]` — массив слоёв (любое количество).

Ключевые поля слоя:

- `enabled`, `enabledAt` — включение слоя и порог прогресса.
- `mode`: `follow` | `aura` | `spark`.
- `shape`: `square` | `circle`.
- `baseSpawnRate`, `maxSpawnRate`.
- `life`, `lifeJitter`, `size`, `sizeJitter`, `alpha`.
- `offsetRadius`, `offsetBias`, `followStrength`, `driftSpeed`, `driftJitter`, `gravity`, `airPush`.
- `colorMode`: `platform` | `fixed` | `palette`:
  - `platform` — берём текущий `tailColor` из игры.
  - `fixed` — фиксированный `color`.
  - `palette` — случайный микс цветов палитры + смешение с `tailColor` через `paletteBlend`.

## Tail Viewer (debug)

Включается клавишей `V` (можно отключить через `particles.tail.viewer.enabled`).

Функции:
- список слоёв (enabled + mode/shape),
- расширенные контролы слоя (spawn/max, size/sizeJitter, life/lifeJitter, alpha, follow/aura/spark параметры, цвета),
- глобальные контролы (snap/grid, global multipliers),
- preview прогресса с сегментами стадий и блокировкой интенсивности при открытом окне,
- редактор `progressStages` с добавлением/удалением стадий,
- монитор FPS + количества живых партиклов,
- `Save`/`Load` сохраняют и загружают tail config из `localStorage`,
- `Reset` откатывает на дефолтный конфиг,
- `Dump JSON` выводит текущий tail config в консоль.
