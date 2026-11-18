const time = document.querySelector('#time')
const date = document.querySelector('#date')

function paint(state) {
  time.textContent = state.data.now.time
  date.textContent = state.data.now.dateLabel
}

sill.ready(paint)
sill.onData(paint)
