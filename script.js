const STORAGE_KEY = "weather-app-state-v1";
const SUGGESTED_CITIES = [
  { name: "Москва", latitude: 55.7558, longitude: 37.6176 },
  { name: "Санкт-Петербург", latitude: 59.9386, longitude: 30.3141 },
  { name: "Новосибирск", latitude: 55.0084, longitude: 82.9357 },
  { name: "Екатеринбург", latitude: 56.8389, longitude: 60.6057 },
  { name: "Казань", latitude: 55.7963, longitude: 49.1088 },
  { name: "Нижний Новгород", latitude: 56.2965, longitude: 43.9361 },
  { name: "Самара", latitude: 53.1959, longitude: 50.1008 },
  { name: "Сочи", latitude: 43.5855, longitude: 39.7231 },
  { name: "Владивосток", latitude: 43.1155, longitude: 131.8855 },
  { name: "Краснодар", latitude: 45.0355, longitude: 38.9753 },
  { name: "Калининград", latitude: 54.7104, longitude: 20.4522 },
];

const state = {
  primary: null,
  cities: [],
  weather: {},
};

const dom = {
  statusArea: document.getElementById("status-area"),
  cards: document.getElementById("cards"),
  refreshBtn: document.getElementById("refresh-btn"),
  cityForm: document.getElementById("city-form"),
  cityInput: document.getElementById("city-input"),
  cityError: document.getElementById("city-error"),
  citySuggestions: document.getElementById("city-suggestions"),
};

document.addEventListener("DOMContentLoaded", () => {
  populateDatalist();
  restoreState();
  setupHandlers();

  if (state.primary || state.cities.length) {
    fetchAllWeather();
  } else {
    requestGeolocation();
  }
});

function setupHandlers() {
  dom.cityForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleCitySubmit();
  });

  dom.refreshBtn.addEventListener("click", () => {
    fetchAllWeather();
  });
}

function populateDatalist() {
  dom.citySuggestions.innerHTML = "";
  SUGGESTED_CITIES.forEach((city) => {
    const option = document.createElement("option");
    option.value = city.name;
    dom.citySuggestions.append(option);
  });
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    state.primary = saved.primary || null;
    state.cities = Array.isArray(saved.cities) ? saved.cities : [];
  } catch {
    // ignore broken storage
  }
}

function persistState() {
  const payload = {
    primary: state.primary,
    cities: state.cities,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function requestGeolocation() {
  if (!navigator.geolocation) {
    renderStatus("Геолокация недоступна в браузере. Добавьте город вручную.", "error");
    return;
  }
  renderStatus("Запрашиваем геолокацию...", "info");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      state.primary = {
        id: "geo",
        name: "Текущее местоположение",
        latitude,
        longitude,
        source: "geo",
      };
      persistState();
      fetchAllWeather();
    },
    () => {
      renderStatus("Нет доступа к геолокации. Добавьте город из списка ниже.", "error");
    },
    { timeout: 8000 }
  );
}

function handleCitySubmit() {
  const value = dom.cityInput.value.trim();
  dom.cityError.textContent = "";
  if (!value) {
    dom.cityError.textContent = "Введите название города.";
    return;
  }

  const matched = SUGGESTED_CITIES.find(
    (city) => city.name.toLowerCase() === value.toLowerCase()
  );

  if (!matched) {
    dom.cityError.textContent = "Город должен быть выбран из списка.";
    return;
  }

  const exists = getLocations().some(
    (city) => city.name.toLowerCase() === matched.name.toLowerCase()
  );
  if (exists) {
    dom.cityError.textContent = "Такой город уже добавлен.";
    return;
  }

  const payload = { ...matched, id: matched.name, source: "manual" };
  if (!state.primary) {
    state.primary = payload;
  } else {
    state.cities.push(payload);
  }
  persistState();
  dom.cityInput.value = "";
  fetchAllWeather();
}

function getLocations() {
  const list = [];
  if (state.primary) list.push(state.primary);
  return list.concat(state.cities);
}

async function fetchAllWeather() {
  const locations = getLocations();
  if (!locations.length) {
    renderStatus("Добавьте город, чтобы посмотреть прогноз.", "info");
    renderCards([]);
    return;
  }

  renderStatus("Обновляем погоду...", "info");
  const results = await Promise.allSettled(
    locations.map((loc) => fetchWeatherForLocation(loc))
  );

  const failed = [];
  results.forEach((result, index) => {
    const loc = locations[index];
    if (result.status === "fulfilled") {
      state.weather[locKey(loc)] = result.value;
    } else {
      failed.push(loc.name);
    }
  });

  renderCards(locations);

  if (failed.length === 0) {
    renderStatus("Погода обновлена.", "info");
  } else if (failed.length === locations.length) {
    renderStatus("Не удалось загрузить данные. Проверьте соединение.", "error");
  } else {
    renderStatus(
      `Часть городов не загрузилась: ${failed.join(", ")}.`,
      "error"
    );
  }
}

async function fetchWeatherForLocation(location) {
  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    daily: "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max",
    current_weather: "true",
    forecast_days: "3",
    timezone: "auto",
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  const data = await response.json();

  return {
    daily: data.daily,
    current: data.current_weather,
  };
}

function renderCards(locations) {
  dom.cards.innerHTML = "";
  if (!locations.length) return;

  locations.forEach((loc) => {
    const card = document.createElement("article");
    card.className = "card";
    const weather = state.weather[locKey(loc)];

    const header = document.createElement("div");
    header.className = "card__header";
    const titleBlock = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "card__title";
    title.textContent = loc.name;
    const subtitle = document.createElement("p");
    subtitle.className = "card__subtitle";
    subtitle.textContent = loc.source === "geo" ? "Геолокация" : "Добавлен вручную";
    titleBlock.append(title, subtitle);
    header.append(titleBlock);
    card.append(header);

    if (!weather) {
      const placeholder = document.createElement("p");
      placeholder.className = "card__subtitle";
      placeholder.textContent = "Загружаем...";
      card.append(placeholder);
      dom.cards.append(card);
      return;
    }

    const forecastWrap = document.createElement("div");
    forecastWrap.className = "forecast";

    const dates = weather.daily.time;
    dates.slice(0, 3).forEach((dateString, idx) => {
      const day = document.createElement("div");
      day.className = "forecast__day";

      const top = document.createElement("div");
      top.className = "forecast__top";
      const label = document.createElement("span");
      label.className = "forecast__label";
      label.textContent = formatDayLabel(idx, dateString);
      const temp = document.createElement("span");
      const min = weather.daily.temperature_2m_min[idx];
      const max = weather.daily.temperature_2m_max[idx];
      const avg = Math.round((min + max) / 2);
      temp.className = "forecast__temp";
      temp.textContent = `${avg}°`;
      top.append(label, temp);

      const meta = document.createElement("div");
      meta.className = "forecast__meta";
      meta.innerHTML = [
        `Мин: ${Math.round(min)}°, макс: ${Math.round(max)}°`,
        `Осадки: ${weather.daily.precipitation_sum[idx]} мм`,
        `Ветер: до ${Math.round(weather.daily.windspeed_10m_max[idx])} км/ч`,
        describeWeather(weather.daily.weathercode[idx]),
      ]
        .map((line) => `<span>${line}</span>`)
        .join("");

      day.append(top, meta);
      forecastWrap.append(day);
    });

    card.append(forecastWrap);
    dom.cards.append(card);
  });
}

function renderStatus(message, type = "info") {
  dom.statusArea.innerHTML = "";
  if (!message) return;
  const box = document.createElement("div");
  box.className = `status status--${type}`;
  const icon = document.createElement("span");
  icon.className = "status__icon";
  icon.textContent = type === "error" ? "⚠️" : "ℹ️";
  const text = document.createElement("span");
  text.textContent = message;
  box.append(icon, text);
  dom.statusArea.append(box);
}

function locKey(loc) {
  return loc.id || loc.name;
}

function formatDayLabel(index, dateString) {
  if (index === 0) return "Сегодня";
  if (index === 1) return "Завтра";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(date);
}

function describeWeather(code) {
  const mapping = {
    0: "Ясно",
    1: "Преимущественно ясно",
    2: "Переменная облачность",
    3: "Пасмурно",
    45: "Туман",
    48: "Инейный туман",
    51: "Лёгкая морось",
    53: "Умеренная морось",
    55: "Сильная морось",
    61: "Лёгкий дождь",
    63: "Дождь",
    65: "Сильный дождь",
    71: "Лёгкий снег",
    73: "Снег",
    75: "Сильный снег",
    80: "Ливень",
    95: "Гроза",
    96: "Гроза с градом",
  };
  return mapping[code] || "Погода неизвестна";
}
