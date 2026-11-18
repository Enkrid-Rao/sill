const time = document.querySelector('#time')
const hint = document.querySelector('#hint')

function render(value) {
  if (!value) return
  time.textContent = value
  hint.textContent = 'rendered by guest JavaScript'
}

sill.ready(({ data }) => {
  render(data.now?.time)
})

document.querySelector('#toggle').addEventListener('click', () => {
  sill.command('media.playpause')
})

// The guest has its own JS realm; this interval is local to the widget.
setInterval(() => {
  const now = new Date()
  render(
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  )
}, 1000)
