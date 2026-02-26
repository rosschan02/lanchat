<template>
  <div class="emoji-picker">
    <div class="emoji-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="emoji-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
      <button class="emoji-close" @click="$emit('close')">✕</button>
    </div>

    <div class="emoji-grid">
      <button
        v-for="emoji in currentEmojis"
        :key="emoji"
        class="emoji-btn"
        @click="pick(emoji)"
      >
        {{ emoji }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const emit = defineEmits(['select', 'close']);

const tabs = [
  { key: 'recent', label: '最近' },
  { key: 'smile', label: '表情' },
  { key: 'gesture', label: '手势' },
  { key: 'symbol', label: '符号' },
];

const emojiMap = {
  smile: ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😭', '😡', '🥳'],
  gesture: ['👍', '👎', '👏', '🙏', '🤝', '👌', '✌️', '🤞', '👀', '💪', '🙌', '👋'],
  symbol: ['❤️', '💔', '⭐', '🔥', '✅', '❌', '⚠️', '🎉', '💯', '📌', '📎', '🔔'],
};

const activeTab = ref('recent');
const RECENT_KEY = 'lanchat_recent_emojis';

function getRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.slice(0, 20) : [];
  } catch (err) {
    return [];
  }
}

function setRecent(list) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 20)));
}

const currentEmojis = computed(() => {
  if (activeTab.value === 'recent') {
    const list = getRecent();
    return list.length ? list : emojiMap.smile;
  }
  return emojiMap[activeTab.value] || [];
});

function pick(emoji) {
  const recent = getRecent().filter((e) => e !== emoji);
  recent.unshift(emoji);
  setRecent(recent);
  emit('select', emoji);
}
</script>

<style scoped>
.emoji-picker {
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  margin-bottom: 8px;
  padding: 8px;
}

.emoji-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.emoji-tab {
  border: 1px solid #dcdfe6;
  background: #fff;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}

.emoji-tab.active {
  border-color: #409eff;
  color: #409eff;
}

.emoji-close {
  margin-left: auto;
  border: 1px solid #dcdfe6;
  background: #fff;
  border-radius: 6px;
  width: 24px;
  height: 24px;
  cursor: pointer;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 6px;
}

.emoji-btn {
  border: 1px solid #ebeef5;
  background: #fff;
  border-radius: 6px;
  height: 30px;
  cursor: pointer;
  font-size: 18px;
}

.emoji-btn:hover {
  background: #f5f7fa;
}
</style>
