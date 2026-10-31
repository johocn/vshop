<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusAfterSalesDetail.loading') }}</view>
    <view v-else-if="!d" class="hint empty">
      <text class="e-t">{{ $t('campusAfterSalesDetail.loadFailed') }}</text>
      <text class="e-a" @tap="reload">{{ $t('campusAfterSalesDetail.retry') }}</text>
    </view>
    <template v-else>
      <!-- 一、售后单概览：状态 / 顾客 / 地址 / 金额 / SLA -->
      <view class="card">
        <view class="head">
          <text class="title">{{ d.request.orderCode }}</text>
          <text class="amt">{{ money(d.request.refundAmount) }}</text>
          <text class="act" :class="{ busy: loading }" @tap="reload">{{ $t('campusAfterSalesDetail.refresh') }}</text>
        </view>
        <view class="pills">
          <text class="pill" :class="stateClass(d.request.state)">{{ stateText(d.request.state) }}</text>
          <text class="pill info">{{ typeText(d.request.type) }}</text>
          <text v-if="d.request.overdue" class="pill bad">{{ $t('campusAfterSalesDetail.tagOverdue') }}</text>
          <text v-else-if="d.request.dueSoon" class="pill warn">{{ $t('campusAfterSalesDetail.tagDueSoon') }}</text>
          <text v-if="d.request.unread" class="pill info">{{ $t('campusAfterSalesDetail.tagUnread') }}</text>
          <text v-if="d.request.refundReviewPending" class="pill info">{{ $t('campusAfterSalesDetail.tagReview') }}</text>
          <text v-if="d.request.riskReason" class="pill bad">{{ $t('campusAfterSalesDetail.tagRisk') }}</text>
          <text v-if="d.request.slaPaused" class="pill mute">{{ $t('campusAfterSalesDetail.tagSla') }}</text>
          <text v-if="d.request.escalated" class="pill warn">{{ $t('campusAfterSalesDetail.tagEscalated') }}</text>
        </view>
        <view class="kv">
          <text class="k">{{ $t('campusAfterSalesDetail.customer') }}</text>
          <text class="v">{{ d.request.customerName || $t('campusAfterSalesDetail.anon') }} · {{ d.customerPhone || '—' }}</text>
        </view>
        <view v-if="d.shippingAddress" class="kv">
          <text class="k">{{ $t('campusAfterSalesDetail.address') }}</text>
          <text class="v">{{ d.shippingAddress.address }}（{{ d.shippingAddress.fullName }} {{ d.shippingAddress.phoneNumber }}）</text>
        </view>
        <view class="kv">
          <text class="k">{{ $t('campusAfterSalesDetail.orderTotal') }}</text>
          <text class="v">{{ money(d.orderTotal) }}</text>
        </view>
        <view class="kv">
          <text class="k">{{ $t('campusAfterSalesDetail.actualRefund') }}</text>
          <text class="v">{{ d.actualRefundAmount == null ? '—' : money(d.actualRefundAmount) }}</text>
        </view>
        <view class="kv">
          <text class="k">{{ $t('campusAfterSalesDetail.sla') }}</text>
          <text class="v">{{ slaText }}</text>
        </view>
        <text class="reason">{{ d.request.reason }}</text>
        <text v-if="d.request.description" class="desc">{{ d.request.description }}</text>
        <text v-if="d.request.rejectReason" class="bad">
          {{ $t('campusAfterSalesDetail.rejectLbl') }}：{{ d.request.rejectReason }}
        </text>
        <text v-if="d.refundError" class="bad">
          {{ $t('campusAfterSalesDetail.failLbl') }}：{{ d.refundError }}
        </text>
        <view v-if="d.request.evidenceImages.length" class="imgs">
          <image
            v-for="(url, i) in d.request.evidenceImages"
            :key="url + i"
            class="imgs__i"
            :src="url"
            mode="aspectFill"
            @tap="preview(url, i)"
          />
        </view>
        <text class="tip">{{ $t('campusAfterSalesDetail.timeoutTip').replace('{h}', String(d.timeoutHours)) }}</text>
      </view>

      <!-- 二、订单商品：核对退哪几件 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesDetail.itemsTitle') }}</text>
          <text class="act">{{ $t('campusAfterSalesDetail.itemsCount').replace('{n}', String(d.orderItems.length)) }}</text>
        </view>
        <text v-if="!d.orderItems.length" class="tip">{{ $t('campusAfterSalesDetail.itemsEmpty') }}</text>
        <view v-else class="lines">
          <view v-for="(l, i) in d.orderItems" :key="i" class="line">
            <text class="l-name">{{ l.name }}</text>
            <text class="l-q">×{{ l.quantity }}</text>
            <text class="l-amt">{{ money(l.unitPrice * l.quantity) }}</text>
          </view>
        </view>
      </view>

      <!-- 三、标签：分组/检索售后单 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesDetail.tagsTitle') }}</text>
          <text class="act" @tap="openSheet('tags')">{{ $t('campusAfterSalesDetail.tagsEdit') }}</text>
        </view>
        <view v-if="d.request.tags.length" class="pills">
          <text v-for="tg in d.request.tags" :key="tg" class="pill light">{{ tg }}</text>
        </view>
        <text v-else class="tip">{{ $t('campusAfterSalesDetail.tagsEmpty') }}</text>
      </view>

      <!-- 四、处置动作：按当前状态给出可用动作 -->
      <view v-if="actions.length" class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesDetail.actTitle') }}</text>
          <text class="act">{{ assigneeText }}</text>
        </view>
        <view class="acts">
          <text
            v-for="a in actions"
            :key="a.key"
            class="act-b"
            :class="{ main: a.main, danger: a.danger }"
            @tap="runAction(a.key)"
          >{{ $t(a.label) }}</text>
        </view>
        <text class="tip">{{ $t('campusAfterSalesDetail.actHint') }}</text>
      </view>

      <!-- 五、退款复核（大额退款需二次确认） -->
      <view v-if="pendingReview" class="card attention">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesDetail.reviewTitle') }}</text>
          <text class="act">{{ money(pendingReview.amount) }}</text>
        </view>
        <text class="desc">
          {{ $t('campusAfterSalesDetail.reviewRequester').replace('{name}', pendingReview.requestedByName || pendingReview.requestedBy) }}
          · {{ timeText(pendingReview.requestedAt) }}
        </text>
        <text v-if="pendingReview.selfRequested" class="tip warn">{{ $t('campusAfterSalesDetail.reviewSelf') }}</text>
        <view class="acts">
          <text class="act-b main" @tap="openSheet('reviewPass')">{{ $t('campusAfterSalesDetail.reviewApprove') }}</text>
          <text class="act-b danger" @tap="openSheet('reviewReject')">{{ $t('campusAfterSalesDetail.reviewReject') }}</text>
        </view>
      </view>

      <!-- 六、退货物流 / 换货物流 -->
      <view v-if="d.request.type !== 'refund_only'" class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesDetail.logisticsTitle') }}</text>
          <text class="act" @tap="openSheet('logistics')">{{ $t('campusAfterSalesDetail.logisticsAdd') }}</text>
        </view>
        <view v-if="logi" class="kv">
          <text class="k">{{ $t('campusAfterSalesDetail.logisticsNo') }}</text>
          <text class="v">{{ logi.trackingNo || '—' }}{{ logi.carrier ? ' · ' + logi.carrier : '' }}</text>
        </view>
        <view v-if="logi" class="kv">
          <text class="k">{{ $t('campusAfterSalesDetail.logisticsState') }}</text>
          <text class="v">{{ logiStateText(logi.state) }}</text>
        </view>
        <view v-if="logi && logi.events.length" class="tl">
          <view v-for="(e, i) in logi.events" :key="e.occurredAt + i" class="tl__i">
            <view class="tl__dot" :class="{ last: i === 0 }" />
            <view class="tl__bd">
              <text class="tl__t">{{ e.description || logiStateText(e.status) }}</text>
              <text class="tl__time">{{ timeText(e.occurredAt) }} · {{ e.source }}</text>
            </view>
          </view>
        </view>
        <text v-else class="tip">{{ $t('campusAfterSalesDetail.logisticsEmpty') }}</text>
        <view v-if="returnAddress" class="addr">
          <text class="addr__l">{{ $t('campusAfterSalesDetail.returnAddress') }}</text>
          <text class="addr__v">{{ returnAddress.fullName }} {{ returnAddress.phoneNumber }}</text>
          <text class="addr__v">{{ returnAddress.address }}</text>
        </view>
      </view>

      <!-- 七、SLA 暂停 / 升级仲裁 -->
      <view v-if="d.slaPauses.length || d.escalations.length" class="card">
        <view class="head"><text class="title">{{ $t('campusAfterSalesDetail.slaHistory') }}</text></view>
        <view v-for="(p, i) in d.slaPauses" :key="p.id + i" class="rec">
          <text class="rec__t">{{ p.reason }}</text>
          <text class="rec__s">
            {{ timeText(p.pausedAt) }} ~ {{ p.resumedAt ? timeText(p.resumedAt) : $t('campusAfterSalesDetail.slaPausedNow') }}
          </text>
        </view>
        <view class="head sub"><text class="title">{{ $t('campusAfterSalesDetail.escalationTitle') }}</text></view>
        <view v-if="!d.escalations.length" class="tip">{{ $t('campusAfterSalesDetail.escalationEmpty') }}</view>
        <view v-for="e in d.escalations" :key="e.id" class="rec">
          <view class="rec__row">
            <text class="pill" :class="e.status === 'resolved' ? 'ok' : 'warn'">{{ escStatusText(e.status) }}</text>
            <text class="pill mute">{{ priorityText(e.priority) }}</text>
            <text class="rec__s">{{ timeText(e.createdAt) }}</text>
          </view>
          <text class="rec__t">{{ e.reason }}</text>
          <text v-if="e.resolution" class="rec__s">{{ $t('campusAfterSalesDetail.escalationResolution') }}：{{ e.resolution }}</text>
          <text v-if="e.status !== 'resolved'" class="rec__a" @tap="openSheet('escalationResolve')">
            {{ $t('campusAfterSalesDetail.escalationResolve') }}
          </text>
        </view>
      </view>

      <!-- 八、回访记录 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesDetail.followTitle') }}</text>
          <text class="act" @tap="openSheet('followUp')">+ {{ $t('campusAfterSalesDetail.followAdd') }}</text>
        </view>
        <view v-if="!d.followUps.length" class="tip">{{ $t('campusAfterSalesDetail.followEmpty') }}</view>
        <view v-for="f in d.followUps" :key="f.id" class="rec">
          <view class="rec__row">
            <text class="pill info">{{ followMethodText(f.method) }}</text>
            <text class="pill" :class="f.result === 'resolved' ? 'ok' : 'warn'">{{ followResultText(f.result) }}</text>
            <text class="rec__s">{{ timeText(f.createdAt) }}{{ f.operatorName ? ' · ' + f.operatorName : '' }}</text>
          </view>
          <text v-if="f.note" class="rec__t">{{ f.note }}</text>
          <text v-if="f.nextAt" class="rec__s">
            {{ $t('campusAfterSalesDetail.followNext') }}：{{ timeText(f.nextAt) }}
          </text>
        </view>
      </view>

      <!-- 九、内部备注（仅商家可见） -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesDetail.notesTitle') }}</text>
          <text class="act" @tap="openSheet('note')">+ {{ $t('campusAfterSalesDetail.notesAdd') }}</text>
        </view>
        <view v-if="!notes.length" class="tip">{{ $t('campusAfterSalesDetail.notesEmpty') }}</view>
        <view v-for="n in notes" :key="n.id" class="note">
          <text class="note__c">{{ n.content }}</text>
          <view class="note__row">
            <text class="note__s">{{ n.createdBy }} · {{ timeText(n.createdAt) }}</text>
            <text class="note__x" @tap="removeNote(n.id)">{{ $t('campusAfterSalesDetail.notesDelete') }}</text>
          </view>
        </view>
      </view>

      <!-- 十、协商沟通 + 快捷回复模板 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesDetail.chatTitle') }}</text>
          <text class="act" @tap="toggleTpl">{{ showTpl ? $t('campusAfterSalesDetail.tplHide') : $t('campusAfterSalesDetail.tplShow') }}</text>
        </view>
        <view v-if="showTpl" class="tpls">
          <text v-if="!templates.length" class="tip">{{ $t('campusAfterSalesDetail.tplEmpty') }}</text>
          <text v-for="t in templates" :key="t.id" class="tpl" @tap="useTemplate(t)">{{ t.content }}</text>
        </view>
        <view v-if="!d.messages.length" class="tip">{{ $t('campusAfterSalesDetail.chatEmpty') }}</view>
        <view v-for="m in d.messages" :key="m.id" class="msg" :class="m.senderType === 'admin' ? 'mine' : 'theirs'">
          <text class="msg__who">{{ m.senderName || '—' }} · {{ timeText(m.createdAt) }}</text>
          <view class="msg__bubble">
            <text class="msg__text">{{ m.content }}</text>
            <view v-if="m.images.length" class="msg__imgs">
              <image
                v-for="(url, i) in m.images"
                :key="url + i"
                class="msg__img"
                :src="url"
                mode="aspectFill"
                @tap="preview(url, i, m.images)"
              />
            </view>
          </view>
        </view>
        <view v-if="canReply" class="chat-ft">
          <input
            v-model="replyText"
            class="chat-ipt"
            maxlength="200"
            :placeholder="$t('campusAfterSalesDetail.chatPh')"
            @confirm="sendReply"
          />
          <button class="chat-send" :disabled="sending" @tap="sendReply">
            {{ sending ? $t('campusAfterSalesDetail.chatSending') : $t('campusAfterSalesDetail.chatSend') }}
          </button>
        </view>
        <text v-else class="tip">{{ $t('campusAfterSalesDetail.chatReadonly') }}</text>
      </view>

      <!-- 十一、状态时间线 -->
      <view class="card">
        <view class="head"><text class="title">{{ $t('campusAfterSalesDetail.timelineTitle') }}</text></view>
        <view class="tl">
          <view
            v-for="(h, i) in timeline"
            :key="h.key"
            class="tl__i"
          >
            <view class="tl__dot" :class="{ last: i === timeline.length - 1 }" />
            <view class="tl__bd">
              <text class="tl__t">{{ h.text }}</text>
              <text class="tl__time">{{ timeText(h.at) }}{{ h.who ? ' · ' + h.who : '' }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 指派/转交留痕 -->
      <view v-if="d.assignHistory.length" class="card">
        <view class="head"><text class="title">{{ $t('campusAfterSalesDetail.assignHistory') }}</text></view>
        <view v-for="(a, i) in d.assignHistory" :key="i" class="rec">
          <text class="rec__t">
            {{ a.fromName || $t('campusAfterSalesDetail.unassigned') }} → {{ a.toName || $t('campusAfterSalesDetail.unassigned') }}
          </text>
          <text class="rec__s">{{ timeText(a.createdAt) }}{{ a.reason ? ' · ' + a.reason : '' }}</text>
        </view>
      </view>
    </template>

    <!-- 处置弹窗：所有动作共用一套底部面板 -->
    <view v-if="sheet" class="mask" @tap.self="closeSheet">
      <view class="sheet">
        <view class="sheet__hd">
          <text class="sheet__t">{{ sheetTitle }}</text>
          <text class="sheet__x" @tap="closeSheet">✕</text>
        </view>
        <text class="sheet__hint">{{ sheetHint }}</text>

        <template v-if="sheet === 'assign' || sheet === 'transfer'">
          <text v-if="!assignees.length" class="t-warn">{{ $t('campusAfterSalesDetail.assignNoStaff') }}</text>
          <view v-else class="opts">
            <view
              v-if="sheet === 'assign'"
              class="opt"
              :class="{ on: form.userId === '' }"
              @tap="form.userId = ''"
            >
              <text class="opt__t">{{ $t('campusAfterSalesDetail.assignNone') }}</text>
            </view>
            <view
              v-for="a in assignees"
              :key="a.id"
              class="opt"
              :class="{ on: form.userId === a.id }"
              @tap="form.userId = a.id"
            >
              <text class="opt__t">{{ a.name }}</text>
              <text class="opt__s">{{ a.identifier }}</text>
            </view>
          </view>
          <textarea
            v-if="sheet === 'transfer'"
            v-model="form.text"
            class="area"
            maxlength="200"
            :placeholder="$t('campusAfterSalesDetail.transferPh')"
          />
        </template>

        <template v-else-if="sheet === 'tags'">
          <view v-if="!tags.length" class="t-warn">{{ $t('campusAfterSalesDetail.tagsNoData') }}</view>
          <view v-else class="opts">
            <view
              v-for="tg in tags"
              :key="tg.id"
              class="opt"
              :class="{ on: form.tagIds.includes(tg.id) }"
              @tap="toggleTag(tg.id)"
            >
              <text class="opt__t">{{ tg.name }}</text>
              <text class="opt__s">{{ $t('campusAfterSalesDetail.tagUsed').replace('{n}', String(tg.usedCount)) }}</text>
            </view>
          </view>
        </template>

        <template v-else-if="sheet === 'offline'">
          <text class="sheet__lbl">{{ $t('campusAfterSalesDetail.offlineAmount') }}</text>
          <input v-model="form.amount" class="ipt" type="digit" :placeholder="$t('campusAfterSalesDetail.amountPh')" />
          <text class="sheet__lbl">{{ $t('campusAfterSalesDetail.offlineMethod') }}</text>
          <picker mode="selector" :range="offlineMethods" range-key="label" :value="form.methodIdx" @change="onPickMethod">
            <view class="ipt picker wide">{{ $t(offlineMethods[form.methodIdx].label) }}</view>
          </picker>
          <text class="sheet__lbl">{{ $t('campusAfterSalesDetail.noteLbl') }}</text>
          <input v-model="form.text" class="ipt" maxlength="120" :placeholder="$t('campusAfterSalesDetail.notePh')" />
        </template>

        <template v-else-if="sheet === 'return'">
          <text class="sheet__lbl">{{ $t('campusAfterSalesDetail.returnQty') }}</text>
          <input v-model="form.qty" class="ipt" type="number" :placeholder="$t('campusAfterSalesDetail.returnQtyPh')" />
          <text class="sheet__lbl">{{ $t('campusAfterSalesDetail.noteLbl') }}</text>
          <input v-model="form.text" class="ipt" maxlength="120" :placeholder="$t('campusAfterSalesDetail.notePh')" />
        </template>

        <template v-else-if="sheet === 'exchange'">
          <text class="sheet__lbl">{{ $t('campusAfterSalesDetail.exchangeNo') }}</text>
          <input v-model="form.trackingNo" class="ipt" maxlength="60" :placeholder="$t('campusAfterSalesDetail.trackingPh')" />
          <text class="sheet__lbl">{{ $t('campusAfterSalesDetail.exchangeCarrier') }}</text>
          <input v-model="form.carrier" class="ipt" maxlength="40" :placeholder="$t('campusAfterSalesDetail.carrierPh')" />
        </template>

        <template v-else-if="sheet === 'logistics'">
          <text class="sheet__lbl">{{ $t('campusAfterSalesDetail.logisticsStatus') }}</text>
          <picker mode="selector" :range="logisticsStatuses" range-key="label" :value="form.statusIdx" @change="onPickStatus">
            <view class="ipt picker wide">{{ $t(logisticsStatuses[form.statusIdx].label) }}</view>
          </picker>
          <text class="sheet__lbl">{{ $t('campusAfterSalesDetail.logisticsDesc') }}</text>
          <input v-model="form.text" class="ipt" maxlength="120" :placeholder="$t('campusAfterSalesDetail.logisticsDescPh')" />
        </template>

        <template v-else-if="sheet === 'followUp'">
          <text class="sheet__lbl">{{ $t('campusAfterSalesDetail.followMethod') }}</text>
          <picker mode="selector" :range="followMethods" range-key="label" :value="form.methodIdx" @change="onPickFollowMethod">
            <view class="ipt picker wide">{{ $t(followMethods[form.methodIdx].label) }}</view>
          </picker>
          <text class="sheet__lbl">{{ $t('campusAfterSalesDetail.followResult') }}</text>
          <picker mode="selector" :range="followResults" range-key="label" :value="form.resultIdx" @change="onPickFollowResult">
            <view class="ipt picker wide">{{ $t(followResults[form.resultIdx].label) }}</view>
          </picker>
          <text class="sheet__lbl">{{ $t('campusAfterSalesDetail.noteLbl') }}</text>
          <input v-model="form.text" class="ipt" maxlength="120" :placeholder="$t('campusAfterSalesDetail.followNotePh')" />
          <text class="sheet__lbl">{{ $t('campusAfterSalesDetail.followNext') }}</text>
          <picker mode="date" :value="form.nextAt || todayKey" :start="todayKey" @change="onPickNextAt">
            <view class="ipt picker wide" :class="{ picked: !!form.nextAt }">
              {{ form.nextAt || $t('campusAfterSalesDetail.followNextPh') }}
            </view>
          </picker>
        </template>

        <template v-else-if="sheet === 'escalate'">
          <textarea
            v-model="form.text"
            class="area"
            maxlength="200"
            :placeholder="$t('campusAfterSalesDetail.escalatePh')"
          />
          <text class="sheet__lbl">{{ $t('campusAfterSalesDetail.escalatePriority') }}</text>
          <picker mode="selector" :range="priorities" range-key="label" :value="form.priorityIdx" @change="onPickPriority">
            <view class="ipt picker wide">{{ $t(priorities[form.priorityIdx].label) }}</view>
          </picker>
        </template>

        <template v-else>
          <textarea
            v-model="form.text"
            class="area"
            :maxlength="sheet === 'note' ? 300 : 200"
            :placeholder="sheetPlaceholder"
          />
        </template>

        <view class="sheet__ops">
          <text class="sheet__clear" @tap="closeSheet">{{ $t('campusAfterSalesDetail.cancel') }}</text>
          <button class="sheet__save" :disabled="busy" @tap="submitSheet">
            {{ busy ? $t('campusAfterSalesDetail.submitting') : $t('campusAfterSalesDetail.confirm') }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import {
  campusMerchantAfterSalesAddFollowUp,
  campusMerchantAfterSalesAddNote,
  campusMerchantAfterSalesApprove,
  campusMerchantAfterSalesAssign,
  campusMerchantAfterSalesAssignees,
  campusMerchantAfterSalesCloseOne,
  campusMerchantAfterSalesConfirmReturn,
  campusMerchantAfterSalesDeleteNote,
  campusMerchantAfterSalesDisposalDetail,
  campusMerchantAfterSalesEscalate,
  campusMerchantAfterSalesEscalationResolve,
  campusMerchantAfterSalesExchangeShip,
  campusMerchantAfterSalesNotes,
  campusMerchantAfterSalesOfflineRefund,
  campusMerchantAfterSalesPauseSla,
  campusMerchantAfterSalesRecordReturnLogistics,
  campusMerchantAfterSalesRefundReviews,
  campusMerchantAfterSalesReject,
  campusMerchantAfterSalesReply,
  campusMerchantAfterSalesReplyTemplates,
  campusMerchantAfterSalesResolveRefundReview,
  campusMerchantAfterSalesResumeSla,
  campusMerchantAfterSalesReturnAddress,
  campusMerchantAfterSalesReturnLogistics,
  campusMerchantAfterSalesRemind,
  campusMerchantAfterSalesRetryRefund,
  campusMerchantAfterSalesRules,
  campusMerchantSetAfterSalesTags,
  campusMerchantAfterSalesTags,
  campusMerchantAfterSalesTransfer,
  type MerchantAfterSalesAddress,
  type MerchantAfterSalesAssignee,
  type MerchantAfterSalesDisposalDetail,
  type MerchantAfterSalesNote,
  type MerchantAfterSalesRefundReview,
  type MerchantAfterSalesReplyTemplate,
  type MerchantAfterSalesReturnLogistics,
  type MerchantAfterSalesRules,
  type MerchantAfterSalesTag,
} from '../../apis/campus';
import { fenToYuanFixed, yuanToFen } from '../../utils/money';
import { formatDateTime } from '../../utils/inventoryFormat';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusMerchant');

const locale = useLocaleStore();
const requestId = ref('');
const d = ref<MerchantAfterSalesDisposalDetail | null>(null);
const notes = ref<MerchantAfterSalesNote[]>([]);
const tags = ref<MerchantAfterSalesTag[]>([]);
const templates = ref<MerchantAfterSalesReplyTemplate[]>([]);
const reviews = ref<MerchantAfterSalesRefundReview[]>([]);
const logi = ref<MerchantAfterSalesReturnLogistics | null>(null);
const returnAddress = ref<MerchantAfterSalesAddress | null>(null);
const rules = ref<MerchantAfterSalesRules | null>(null);
const assignees = ref<MerchantAfterSalesAssignee[]>([]);
const loading = ref(true);
const busy = ref(false);
const sending = ref(false);
const replyText = ref('');
const showTpl = ref(false);

const todayKey = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

function money(fen: number): string {
  return '¥' + fenToYuanFixed(fen);
}

function timeText(raw?: string | null): string {
  const s = formatDateTime(raw);
  return s ? s.slice(5) : '';
}

function stateText(state: string): string {
  const map: Record<string, string> = {
    Pending: locale.t('campusAfterSalesDetail.statePending'),
    Received: locale.t('campusAfterSalesDetail.stateReceiving'),
    Refunded: locale.t('campusAfterSalesDetail.stateRefunded'),
    Rejected: locale.t('campusAfterSalesDetail.stateRejected'),
    RefundFailed: locale.t('campusAfterSalesDetail.stateFailed'),
    Approved: locale.t('campusAfterSalesDetail.stateApproved'),
    Appealed: locale.t('campusAfterSalesDetail.stateAppealed'),
    Closed: locale.t('campusAfterSalesDetail.stateClosed'),
  };
  return map[state] ?? state;
}

function stateClass(state: string): string {
  if (state === 'RefundFailed') return 'bad';
  if (state === 'Pending' || state === 'Received') return 'wait';
  if (state === 'Refunded') return 'ok';
  return 'mute';
}

function typeText(type: string): string {
  const map: Record<string, string> = {
    refund_only: locale.t('campusAfterSalesDetail.typeRefundOnly'),
    return_refund: locale.t('campusAfterSalesDetail.typeReturnRefund'),
    exchange: locale.t('campusAfterSalesDetail.typeExchange'),
  };
  return map[type] ?? type;
}

function priorityText(p: string): string {
  const map: Record<string, string> = {
    normal: locale.t('campusAfterSalesDetail.priNormal'),
    high: locale.t('campusAfterSalesDetail.priHigh'),
    urgent: locale.t('campusAfterSalesDetail.priUrgent'),
  };
  return map[p] ?? p;
}

function escStatusText(s: string): string {
  return s === 'resolved'
    ? locale.t('campusAfterSalesDetail.escResolved')
    : locale.t('campusAfterSalesDetail.escOpen');
}

function followMethodText(m: string): string {
  const map: Record<string, string> = {
    phone: locale.t('campusAfterSalesDetail.fmPhone'),
    sms: locale.t('campusAfterSalesDetail.fmSms'),
    wechat: locale.t('campusAfterSalesDetail.fmWechat'),
    visit: locale.t('campusAfterSalesDetail.fmVisit'),
  };
  return map[m] ?? m;
}

function followResultText(r: string): string {
  const map: Record<string, string> = {
    resolved: locale.t('campusAfterSalesDetail.frResolved'),
    unresolved: locale.t('campusAfterSalesDetail.frUnresolved'),
    pending: locale.t('campusAfterSalesDetail.frPending'),
  };
  return map[r] ?? r;
}

function logiStateText(s: string): string {
  const map: Record<string, string> = {
    shipped: locale.t('campusAfterSalesDetail.lsShipped'),
    transit: locale.t('campusAfterSalesDetail.lsTransit'),
    delivered: locale.t('campusAfterSalesDetail.lsDelivered'),
    exception: locale.t('campusAfterSalesDetail.lsException'),
  };
  return map[s] ?? s;
}

/** 超时口径：详情返回的 timeoutHours 优先，规则接口作为补充说明 */
const slaText = computed(() => {
  const t = d.value?.timeoutHours ?? rules.value?.timeoutHours ?? 0;
  return locale.t('campusAfterSalesDetail.slaValue').replace('{h}', String(t));
});

const assigneeText = computed(() =>
  d.value?.request.assigneeName
    ? locale.t('campusAfterSalesDetail.assignee').replace('{name}', d.value.request.assigneeName)
    : locale.t('campusAfterSalesDetail.unassigned'),
);

const canReply = computed(() => {
  const st = d.value?.request.state ?? '';
  return st === 'Pending' || st === 'Appealed' || st === 'Received';
});

const pendingReview = computed(() => {
  const id = d.value?.request.id;
  if (!id) return null;
  return reviews.value.find(r => r.requestId === id && r.status === 'Pending') ?? null;
});

const timeline = computed(() => {
  const rows = d.value?.stateHistory ?? [];
  const head = d.value
    ? [{ key: 'submit', text: locale.t('campusAfterSalesDetail.tlSubmit'), at: d.value.request.createdAt, who: '' }]
    : [];
  return [
    ...head,
    ...rows.map((h, i) => ({
      key: `${h.toState}-${i}`,
      text: `${h.fromState ? stateText(h.fromState) + ' → ' : ''}${stateText(h.toState)}`,
      at: h.createdAt,
      who: h.operatorName ?? '',
    })),
  ];
});

/** 按状态给出可用动作；风险动作（驳回/关闭）用红色区分 */
const actions = computed(() => {
  const st = d.value?.request.state ?? '';
  const out: Array<{ key: SheetKey | 'approve' | 'retry' | 'resumeSla'; label: string; main?: boolean; danger?: boolean }> = [];
  if (st === 'Pending' || st === 'Appealed') {
    out.push({ key: 'approve', label: 'campusAfterSalesDetail.actApprove', main: true });
    out.push({ key: 'reject', label: 'campusAfterSalesDetail.actReject', danger: true });
  }
  if (st === 'Received') {
    out.push({ key: 'return', label: 'campusAfterSalesDetail.actReturn', main: true });
    out.push({ key: 'exchange', label: 'campusAfterSalesDetail.actExchange' });
  }
  if (st === 'RefundFailed') {
    out.push({ key: 'retry', label: 'campusAfterSalesDetail.actRetry', main: true });
  }
  if (st === 'Pending' || st === 'Received' || st === 'RefundFailed') {
    out.push({ key: 'offline', label: 'campusAfterSalesDetail.actOffline' });
    out.push({ key: 'remind', label: 'campusAfterSalesDetail.actRemind' });
  }
  if (d.value?.request.slaPaused) out.push({ key: 'resumeSla', label: 'campusAfterSalesDetail.actResumeSla' });
  else if (st === 'Pending' || st === 'Received' || st === 'RefundFailed') {
    out.push({ key: 'slaPause', label: 'campusAfterSalesDetail.actPauseSla' });
  }
  if (!d.value?.request.escalated) out.push({ key: 'escalate', label: 'campusAfterSalesDetail.actEscalate' });
  out.push({ key: 'assign', label: 'campusAfterSalesDetail.actAssign' });
  out.push({ key: 'transfer', label: 'campusAfterSalesDetail.actTransfer' });
  if (st === 'Pending' || st === 'Received' || st === 'RefundFailed') {
    out.push({ key: 'close', label: 'campusAfterSalesDetail.actClose', danger: true });
  }
  return out;
});

/* ---------- 底部面板 ---------- */
type SheetKey =
  | ''
  | 'reject'
  | 'close'
  | 'escalate'
  | 'escalationResolve'
  | 'slaPause'
  | 'remind'
  | 'offline'
  | 'return'
  | 'exchange'
  | 'logistics'
  | 'followUp'
  | 'note'
  | 'tags'
  | 'assign'
  | 'transfer'
  | 'reviewPass'
  | 'reviewReject';

const sheet = ref<SheetKey>('');
const form = ref({
  text: '',
  amount: '',
  qty: '',
  trackingNo: '',
  carrier: '',
  userId: '',
  tagIds: [] as string[],
  methodIdx: 0,
  statusIdx: 0,
  resultIdx: 0,
  priorityIdx: 0,
  nextAt: '',
});

const offlineMethods = [
  { value: 'cash', label: 'campusAfterSalesDetail.mCash' },
  { value: 'wechat', label: 'campusAfterSalesDetail.mWechat' },
  { value: 'alipay', label: 'campusAfterSalesDetail.mAlipay' },
  { value: 'bank', label: 'campusAfterSalesDetail.mBank' },
];
const logisticsStatuses = [
  { value: 'shipped', label: 'campusAfterSalesDetail.lsShipped' },
  { value: 'transit', label: 'campusAfterSalesDetail.lsTransit' },
  { value: 'delivered', label: 'campusAfterSalesDetail.lsDelivered' },
  { value: 'exception', label: 'campusAfterSalesDetail.lsException' },
];
const followMethods = [
  { value: 'phone', label: 'campusAfterSalesDetail.fmPhone' },
  { value: 'sms', label: 'campusAfterSalesDetail.fmSms' },
  { value: 'wechat', label: 'campusAfterSalesDetail.fmWechat' },
  { value: 'visit', label: 'campusAfterSalesDetail.fmVisit' },
];
const followResults = [
  { value: 'resolved', label: 'campusAfterSalesDetail.frResolved' },
  { value: 'unresolved', label: 'campusAfterSalesDetail.frUnresolved' },
  { value: 'pending', label: 'campusAfterSalesDetail.frPending' },
];
const priorities = [
  { value: 'normal', label: 'campusAfterSalesDetail.priNormal' },
  { value: 'high', label: 'campusAfterSalesDetail.priHigh' },
  { value: 'urgent', label: 'campusAfterSalesDetail.priUrgent' },
];

const sheetTitle = computed(() => {
  const map: Record<string, string> = {
    reject: 'campusAfterSalesDetail.rejectTitle',
    close: 'campusAfterSalesDetail.closeTitle',
    escalate: 'campusAfterSalesDetail.escalateTitle',
    escalationResolve: 'campusAfterSalesDetail.escalationResolveTitle',
    slaPause: 'campusAfterSalesDetail.slaPauseTitle',
    remind: 'campusAfterSalesDetail.remindTitle',
    offline: 'campusAfterSalesDetail.offlineTitle',
    return: 'campusAfterSalesDetail.returnTitle',
    exchange: 'campusAfterSalesDetail.exchangeTitle',
    logistics: 'campusAfterSalesDetail.logisticsTitle2',
    followUp: 'campusAfterSalesDetail.followSheetTitle',
    note: 'campusAfterSalesDetail.noteSheetTitle',
    tags: 'campusAfterSalesDetail.tagsPickTitle',
    assign: 'campusAfterSalesDetail.assignTitle',
    transfer: 'campusAfterSalesDetail.transferTitle',
    reviewPass: 'campusAfterSalesDetail.reviewPassTitle',
    reviewReject: 'campusAfterSalesDetail.reviewRejectTitle',
  };
  return map[sheet.value] ? locale.t(map[sheet.value]) : '';
});

const sheetHint = computed(() => {
  const map: Record<string, string> = {
    reject: 'campusAfterSalesDetail.rejectHint',
    close: 'campusAfterSalesDetail.closeHint',
    escalate: 'campusAfterSalesDetail.escalateHint',
    escalationResolve: 'campusAfterSalesDetail.escalationResolveHint',
    slaPause: 'campusAfterSalesDetail.slaPauseHint',
    remind: 'campusAfterSalesDetail.remindHint',
    offline: 'campusAfterSalesDetail.offlineHint',
    return: 'campusAfterSalesDetail.returnHint',
    exchange: 'campusAfterSalesDetail.exchangeHint',
    logistics: 'campusAfterSalesDetail.logisticsHint',
    followUp: 'campusAfterSalesDetail.followSheetHint',
    note: 'campusAfterSalesDetail.noteSheetHint',
    tags: 'campusAfterSalesDetail.tagsHint',
    assign: 'campusAfterSalesDetail.assignHint',
    transfer: 'campusAfterSalesDetail.transferHint',
    reviewPass: 'campusAfterSalesDetail.reviewHint',
    reviewReject: 'campusAfterSalesDetail.reviewHint',
  };
  return map[sheet.value] ? locale.t(map[sheet.value]) : '';
});

const sheetPlaceholder = computed(() => {
  const map: Record<string, string> = {
    reject: 'campusAfterSalesDetail.rejectPh',
    close: 'campusAfterSalesDetail.closePh',
    escalationResolve: 'campusAfterSalesDetail.escalationResolvePh',
    slaPause: 'campusAfterSalesDetail.slaPausePh',
    remind: 'campusAfterSalesDetail.remindPh',
    note: 'campusAfterSalesDetail.noteSheetPh',
    reviewPass: 'campusAfterSalesDetail.reviewPh',
    reviewReject: 'campusAfterSalesDetail.reviewPh',
  };
  return map[sheet.value] ? locale.t(map[sheet.value]) : '';
});

function openSheet(key: SheetKey): void {
  sheet.value = key;
  form.value = {
    text: '',
    amount: '',
    qty: '',
    trackingNo: '',
    carrier: '',
    userId: '',
    tagIds: [],
    methodIdx: 0,
    statusIdx: 0,
    resultIdx: 0,
    priorityIdx: 0,
    nextAt: '',
  };
  if (key === 'assign') form.value.userId = d.value?.request.assigneeUserId ?? '';
  if (key === 'offline' && d.value) form.value.amount = fenToYuanFixed(d.value.request.refundAmount);
  if (key === 'assign' || key === 'transfer') void loadAssignees();
  if (key === 'tags') void loadTags();
}

function closeSheet(): void {
  if (busy.value) return;
  sheet.value = '';
}

function toggleTag(id: string): void {
  const idx = form.value.tagIds.indexOf(id);
  if (idx >= 0) form.value.tagIds.splice(idx, 1);
  else form.value.tagIds.push(id);
}

function onPickMethod(e: any): void {
  form.value.methodIdx = Number(e?.detail?.value ?? 0);
}
function onPickStatus(e: any): void {
  form.value.statusIdx = Number(e?.detail?.value ?? 0);
}
function onPickFollowMethod(e: any): void {
  form.value.methodIdx = Number(e?.detail?.value ?? 0);
}
function onPickFollowResult(e: any): void {
  form.value.resultIdx = Number(e?.detail?.value ?? 0);
}
function onPickPriority(e: any): void {
  form.value.priorityIdx = Number(e?.detail?.value ?? 0);
}
function onPickNextAt(e: any): void {
  form.value.nextAt = String(e?.detail?.value ?? '');
}

/* ---------- 加载 ---------- */
async function loadAssignees(): Promise<void> {
  if (assignees.value.length) return;
  try {
    assignees.value = await campusMerchantAfterSalesAssignees();
  } catch {
    assignees.value = [];
  }
}

async function loadTags(): Promise<void> {
  try {
    tags.value = await campusMerchantAfterSalesTags();
    const matched = tags.value.filter(t => (d.value?.request.tags ?? []).includes(t.name));
    form.value.tagIds = matched.map(t => t.id);
  } catch {
    tags.value = [];
  }
}

async function loadTemplates(): Promise<void> {
  try {
    templates.value = await campusMerchantAfterSalesReplyTemplates();
  } catch {
    templates.value = [];
  }
}

async function loadSide(): Promise<void> {
  const id = requestId.value;
  if (!id) return;
  await Promise.all([
    campusMerchantAfterSalesNotes(id).then(r => { notes.value = r; }).catch(() => { notes.value = []; }),
    campusMerchantAfterSalesRefundReviews('Pending').then(r => { reviews.value = r; }).catch(() => { reviews.value = []; }),
    campusMerchantAfterSalesReturnLogistics(id).then(r => { logi.value = r; }).catch(() => { logi.value = null; }),
    campusMerchantAfterSalesReturnAddress().then(r => { returnAddress.value = r; }).catch(() => { returnAddress.value = null; }),
    campusMerchantAfterSalesRules().then(r => { rules.value = r; }).catch(() => { rules.value = null; }),
  ]);
}

async function reload(): Promise<void> {
  if (!requestId.value) return;
  loading.value = true;
  try {
    d.value = await campusMerchantAfterSalesDisposalDetail(requestId.value);
  } catch (err: any) {
    d.value = null;
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesDetail.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function reloadAll(): Promise<void> {
  await reload();
  await Promise.all([loadSide(), loadTemplates()]);
}

/* ---------- 动作入口 ---------- */
function runAction(key: string): void {
  if (key === 'approve') return doApprove();
  if (key === 'retry') return doRetry();
  if (key === 'resumeSla') return doResumeSla();
  openSheet(key as SheetKey);
}

function doApprove(): void {
  const cur = d.value;
  if (!cur) return;
  uni.showModal({
    title: locale.t('campusAfterSalesDetail.actApprove'),
    content: locale.t('campusAfterSalesDetail.approveBody')
      .replace('{code}', cur.request.orderCode)
      .replace('{amt}', money(cur.request.refundAmount)),
    confirmText: locale.t('campusAfterSalesDetail.confirm'),
    cancelText: locale.t('campusAfterSalesDetail.cancel'),
    success: async r => {
      if (!r.confirm) return;
      busy.value = true;
      try {
        const updated = await campusMerchantAfterSalesApprove(cur.request.id);
        uni.showToast({
          title: updated.state === 'Refunded'
            ? locale.t('campusAfterSalesDetail.approved')
            : locale.t('campusAfterSalesDetail.approvePending'),
          icon: 'none',
        });
        await reloadAll();
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesDetail.actionFailed')), icon: 'none' });
      } finally {
        busy.value = false;
      }
    },
  });
}

function doRetry(): void {
  const cur = d.value;
  if (!cur) return;
  uni.showModal({
    title: locale.t('campusAfterSalesDetail.actRetry'),
    content: locale.t('campusAfterSalesDetail.retryBody')
      .replace('{code}', cur.request.orderCode)
      .replace('{amt}', money(cur.request.refundAmount)),
    confirmText: locale.t('campusAfterSalesDetail.confirm'),
    cancelText: locale.t('campusAfterSalesDetail.cancel'),
    success: async r => {
      if (!r.confirm) return;
      busy.value = true;
      try {
        const updated = await campusMerchantAfterSalesRetryRefund(cur.request.id);
        uni.showToast({
          title: updated.state === 'Refunded'
            ? locale.t('campusAfterSalesDetail.retryOk')
            : locale.t('campusAfterSalesDetail.approvePending'),
          icon: 'none',
        });
        await reloadAll();
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesDetail.actionFailed')), icon: 'none' });
      } finally {
        busy.value = false;
      }
    },
  });
}

async function doResumeSla(): Promise<void> {
  const id = d.value?.request.id;
  if (!id || busy.value) return;
  busy.value = true;
  try {
    await campusMerchantAfterSalesResumeSla(id);
    uni.showToast({ title: locale.t('campusAfterSalesDetail.slaResumed'), icon: 'none' });
    await reloadAll();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesDetail.actionFailed')), icon: 'none' });
  } finally {
    busy.value = false;
  }
}

function needText(): string | null {
  const t = form.value.text.trim();
  if (!t) {
    uni.showToast({ title: locale.t('campusAfterSalesDetail.required'), icon: 'none' });
    return null;
  }
  return t;
}

async function submitSheet(): Promise<void> {
  const id = d.value?.request.id;
  if (!id || busy.value) return;
  const mode = sheet.value;
  busy.value = true;
  try {
    if (mode === 'reject') {
      const why = needText();
      if (!why) return;
      const updated = await campusMerchantAfterSalesReject(id, why);
      uni.showToast({ title: stateText(updated.state), icon: 'none' });
    } else if (mode === 'close') {
      const why = needText();
      if (!why) return;
      await campusMerchantAfterSalesCloseOne(id, why);
      uni.showToast({ title: locale.t('campusAfterSalesDetail.actionDone'), icon: 'none' });
    } else if (mode === 'escalate') {
      const why = needText();
      if (!why) return;
      d.value!.escalations = await campusMerchantAfterSalesEscalate({
        id,
        reason: why,
        priority: priorities[form.value.priorityIdx].value,
      });
      uni.showToast({ title: locale.t('campusAfterSalesDetail.escalated'), icon: 'none' });
    } else if (mode === 'escalationResolve') {
      const open = d.value?.escalations.find(e => e.status !== 'resolved');
      if (!open) return;
      d.value!.escalations = await campusMerchantAfterSalesEscalationResolve({
        id: open.id,
        resolution: form.value.text.trim() || null,
      });
      uni.showToast({ title: locale.t('campusAfterSalesDetail.actionDone'), icon: 'none' });
    } else if (mode === 'slaPause') {
      const why = needText();
      if (!why) return;
      await campusMerchantAfterSalesPauseSla(id, why);
      uni.showToast({ title: locale.t('campusAfterSalesDetail.slaPaused'), icon: 'none' });
    } else if (mode === 'remind') {
      await campusMerchantAfterSalesRemind(id, form.value.text.trim() || null);
      uni.showToast({ title: locale.t('campusAfterSalesDetail.reminded'), icon: 'none' });
    } else if (mode === 'offline') {
      const fen = yuanToFen(form.value.amount.trim());
      if (fen == null || fen <= 0) {
        uni.showToast({ title: locale.t('campusAfterSalesDetail.invalidAmount'), icon: 'none' });
        return;
      }
      const r = await campusMerchantAfterSalesOfflineRefund({
        id,
        amount: fen,
        method: offlineMethods[form.value.methodIdx].value,
        note: form.value.text.trim() || null,
      });
      uni.showToast({
        title: locale.t('campusAfterSalesDetail.offlineOk').replace('{amt}', money(r.actualRefundAmount)),
        icon: 'none',
      });
    } else if (mode === 'return') {
      const q = form.value.qty.trim();
      await campusMerchantAfterSalesConfirmReturn({
        id,
        receivedQuantity: q ? Number(q) : null,
        note: form.value.text.trim() || null,
      });
      uni.showToast({ title: locale.t('campusAfterSalesDetail.returnOk'), icon: 'none' });
    } else if (mode === 'exchange') {
      const no = form.value.trackingNo.trim();
      if (!no) {
        uni.showToast({ title: locale.t('campusAfterSalesDetail.trackingRequired'), icon: 'none' });
        return;
      }
      await campusMerchantAfterSalesExchangeShip({
        id,
        trackingNo: no,
        carrier: form.value.carrier.trim() || null,
      });
      uni.showToast({ title: locale.t('campusAfterSalesDetail.exchangeOk'), icon: 'none' });
    } else if (mode === 'logistics') {
      logi.value = await campusMerchantAfterSalesRecordReturnLogistics({
        id,
        status: logisticsStatuses[form.value.statusIdx].value,
        description: form.value.text.trim() || null,
      });
      uni.showToast({ title: locale.t('campusAfterSalesDetail.actionDone'), icon: 'none' });
    } else if (mode === 'followUp') {
      d.value!.followUps = await campusMerchantAfterSalesAddFollowUp({
        id,
        method: followMethods[form.value.methodIdx].value,
        result: followResults[form.value.resultIdx].value,
        note: form.value.text.trim() || null,
        nextAt: form.value.nextAt || null,
      });
      uni.showToast({ title: locale.t('campusAfterSalesDetail.followSaved'), icon: 'none' });
    } else if (mode === 'note') {
      const body = needText();
      if (!body) return;
      const created = await campusMerchantAfterSalesAddNote(id, body);
      notes.value = [created, ...notes.value];
      uni.showToast({ title: locale.t('campusAfterSalesDetail.actionDone'), icon: 'none' });
    } else if (mode === 'tags') {
      const names = await campusMerchantSetAfterSalesTags(id, form.value.tagIds);
      d.value!.request.tags = names;
      uni.showToast({ title: locale.t('campusAfterSalesDetail.tagsSaved'), icon: 'none' });
    } else if (mode === 'assign') {
      const updated = await campusMerchantAfterSalesAssign(id, form.value.userId || null);
      d.value!.request.assigneeUserId = updated.assigneeUserId;
      d.value!.request.assigneeName = updated.assigneeName;
      uni.showToast({ title: locale.t('campusAfterSalesDetail.actionDone'), icon: 'none' });
    } else if (mode === 'transfer') {
      const why = needText();
      if (!why) return;
      if (!form.value.userId) {
        uni.showToast({ title: locale.t('campusAfterSalesDetail.transferNeedUser'), icon: 'none' });
        return;
      }
      const updated = await campusMerchantAfterSalesTransfer(id, form.value.userId, why);
      d.value!.request.assigneeUserId = updated.assigneeUserId;
      d.value!.request.assigneeName = updated.assigneeName;
      uni.showToast({ title: locale.t('campusAfterSalesDetail.actionDone'), icon: 'none' });
    } else if (mode === 'reviewPass' || mode === 'reviewReject') {
      const review = pendingReview.value;
      if (!review) return;
      const approve = mode === 'reviewPass';
      const res = await campusMerchantAfterSalesResolveRefundReview({
        id: review.id,
        approve,
        note: form.value.text.trim() || null,
      });
      reviews.value = reviews.value.filter(r => r.id !== res.id);
      uni.showToast({
        title: approve ? locale.t('campusAfterSalesDetail.reviewPassed') : locale.t('campusAfterSalesDetail.reviewRejected'),
        icon: 'none',
      });
    }
    sheet.value = '';
    await reloadAll();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesDetail.actionFailed')), icon: 'none' });
  } finally {
    busy.value = false;
  }
}

function removeNote(noteId: string): void {
  uni.showModal({
    title: locale.t('campusAfterSalesDetail.notesDelete'),
    content: locale.t('campusAfterSalesDetail.notesDeleteBody'),
    confirmText: locale.t('campusAfterSalesDetail.confirm'),
    cancelText: locale.t('campusAfterSalesDetail.cancel'),
    success: async r => {
      if (!r.confirm) return;
      try {
        await campusMerchantAfterSalesDeleteNote(requestId.value, noteId);
        notes.value = notes.value.filter(n => n.id !== noteId);
        uni.showToast({ title: locale.t('campusAfterSalesDetail.actionDone'), icon: 'none' });
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesDetail.actionFailed')), icon: 'none' });
      }
    },
  });
}

/* ---------- 沟通 ---------- */
function toggleTpl(): void {
  showTpl.value = !showTpl.value;
}

function useTemplate(t: MerchantAfterSalesReplyTemplate): void {
  replyText.value = t.content;
  showTpl.value = false;
}

async function sendReply(): Promise<void> {
  const cur = d.value;
  if (!cur || sending.value) return;
  const content = replyText.value.trim();
  if (!content) {
    uni.showToast({ title: locale.t('campusAfterSalesDetail.chatRequired'), icon: 'none' });
    return;
  }
  sending.value = true;
  try {
    const msg = await campusMerchantAfterSalesReply(cur.request.id, content);
    cur.messages.push(msg);
    cur.messageTotal += 1;
    cur.request.messageCount += 1;
    replyText.value = '';
    uni.showToast({ title: locale.t('campusAfterSalesDetail.chatSent'), icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesDetail.actionFailed')), icon: 'none' });
  } finally {
    sending.value = false;
  }
}

function preview(url: string, index: number, urls?: string[]): void {
  const list = urls?.length ? urls : d.value?.request.evidenceImages ?? [url];
  uni.previewImage({ urls: list, current: list[index] ?? url });
}

/* ---------- 生命周期 ---------- */
onLoad((options: any) => {
  requestId.value = String(options?.id || '');
  void reloadAll();
});

onShow(() => {
  if (!loading.value && requestId.value) void loadSide();
});

onPullDownRefresh(async () => {
  await reloadAll();
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 80rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0;
    &.empty { display: flex; flex-direction: column; gap: 24rpx; }
    .e-t { font-size: 26rpx; }
    .e-a { font-size: 26rpx; color: $wa-accent; }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .head { display: flex; align-items: center; gap: 16rpx; margin-bottom: 12rpx;
      .title { flex: 1; font-size: 30rpx; color: $wa-ink; font-weight: 700; }
      .amt { font-size: 30rpx; color: #d4380d; font-weight: 700; }
      .act { font-size: 24rpx; color: $wa-accent; &.busy { opacity: .6; } }
      &.sub { margin-top: 20rpx; padding-top: 16rpx; border-top: 1px solid $wa-rule; }
    }
    .pills { display: flex; flex-wrap: wrap; gap: 10rpx; margin-bottom: 12rpx; }
    .kv { display: flex; align-items: flex-start; gap: 16rpx; padding: 6rpx 0;
      .k { flex: none; width: 132rpx; font-size: 24rpx; color: $wa-muted; }
      .v { flex: 1; font-size: 24rpx; color: $wa-ink; line-height: 1.5; word-break: break-all; }
    }
    .reason { display: block; margin-top: 12rpx; font-size: 26rpx; color: $wa-ink; line-height: 1.55; }
    .desc { display: block; margin-top: 8rpx; font-size: 24rpx; color: $wa-muted; line-height: 1.5; }
    .bad { display: block; margin-top: 8rpx; font-size: 24rpx; color: #a8071a; line-height: 1.5; }
    .tip { display: block; margin-top: 10rpx; font-size: 22rpx; color: $wa-muted; line-height: 1.5;
      &.warn { color: #fa8c16; }
    }
    .imgs { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 14rpx;
      &__i { width: 152rpx; height: 152rpx; border-radius: 12rpx; background: $wa-bg; }
    }
    .lines { display: flex; flex-direction: column; gap: 4rpx; margin-top: 4rpx;
      .line { display: flex; align-items: center; gap: 16rpx; padding: 14rpx 0;
        border-top: 1px solid $wa-rule;
        .l-name { flex: 1; font-size: 26rpx; color: $wa-ink; }
        .l-q { font-size: 24rpx; color: $wa-muted; }
        .l-amt { font-size: 26rpx; color: $wa-ink; font-weight: 600; }
      }
    }
    .acts { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 8rpx;
      .act-b { font-size: 24rpx; color: $wa-ink; background: $wa-bg; border-radius: 999rpx;
        padding: 12rpx 28rpx;
        &.main { background: $wa-accent; color: #fff; font-weight: 600; }
        &.danger { color: #d4380d; }
      }
    }
    .rec { display: flex; flex-direction: column; gap: 6rpx; padding: 14rpx 0; border-top: 1px solid $wa-rule;
      .rec__row { display: flex; align-items: center; gap: 10rpx; }
      .rec__t { font-size: 24rpx; color: $wa-ink; line-height: 1.5; }
      .rec__s { font-size: 22rpx; color: $wa-muted; }
      .rec__a { align-self: flex-start; font-size: 24rpx; color: $wa-accent; }
    }
    .note { padding: 16rpx 0; border-top: 1px solid $wa-rule; display: flex; flex-direction: column; gap: 6rpx;
      .note__c { font-size: 24rpx; color: $wa-ink; line-height: 1.55; }
      .note__row { display: flex; align-items: center; gap: 16rpx;
        .note__s { flex: 1; font-size: 22rpx; color: $wa-muted; }
        .note__x { font-size: 22rpx; color: #d4380d; }
      }
    }
    .tpls { display: flex; flex-direction: column; gap: 10rpx; margin: 8rpx 0 4rpx;
      .tpl { font-size: 24rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius;
        padding: 14rpx 20rpx; line-height: 1.5; }
    }
    .msg { display: flex; flex-direction: column; gap: 6rpx; margin-top: 12rpx;
      &.mine { align-items: flex-end; }
      &.theirs { align-items: flex-start; }
      &__who { font-size: 20rpx; color: $wa-muted; }
      &__bubble { max-width: 84%; background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx;
        display: flex; flex-direction: column; gap: 10rpx; }
      &.mine &__bubble { background: #eaf3ff; }
      &__text { font-size: 24rpx; color: $wa-ink; line-height: 1.55; word-break: break-all; }
      &__imgs { display: flex; gap: 10rpx; }
      &__img { width: 120rpx; height: 120rpx; border-radius: 10rpx; }
    }
    .chat-ft { display: flex; align-items: center; gap: 12rpx; margin-top: 16rpx;
      .chat-ipt { flex: 1; height: 72rpx; background: $wa-bg; border-radius: $wa-radius;
        padding: 0 20rpx; font-size: 26rpx; box-sizing: border-box; }
      .chat-send { flex: none; margin: 0; height: 72rpx; line-height: 72rpx; padding: 0 28rpx;
        background: $wa-accent; color: #fff; font-size: 24rpx; border-radius: 999rpx; border: none;
        &[disabled] { opacity: .6; }
      }
    }
    .addr { margin-top: 16rpx; padding: 16rpx 20rpx; background: $wa-bg; border-radius: $wa-radius;
      display: flex; flex-direction: column; gap: 4rpx;
      .addr__l { font-size: 22rpx; color: $wa-muted; }
      .addr__v { font-size: 24rpx; color: $wa-ink; line-height: 1.5; }
    }
    .tl { display: flex; flex-direction: column; gap: 4rpx;
      &__i { display: flex; gap: 16rpx; padding-bottom: 16rpx; }
      &__dot { flex: none; width: 16rpx; height: 16rpx; margin-top: 8rpx; border-radius: 50%;
        background: $wa-rule; &.last { background: $wa-accent; } }
      &__bd { flex: 1; display: flex; flex-direction: column; gap: 4rpx; }
      &__t { font-size: 24rpx; color: $wa-ink; }
      &__time { font-size: 22rpx; color: $wa-muted; }
    }
    &.attention { border-left: 6rpx solid #fa8c16; }
  }
  .pill { font-size: 22rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
    &.wait { color: #ad6800; background: #fffbe6; }
    &.ok { color: #237804; background: #f6ffed; }
    &.bad { color: #a8071a; background: #fff1f0; }
    &.warn { color: #ad6800; background: #fffbe6; }
    &.info { color: #1677ff; background: #eaf3ff; }
    &.mute { color: #8c8c8c; background: $wa-rule; }
    &.light { color: #1677ff; background: #f0f7ff; }
  }
}
.mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 300; display: flex; align-items: flex-end; }
.sheet { width: 100%; max-height: 86vh; overflow-y: auto; background: $wa-card;
  border-radius: 24rpx 24rpx 0 0; padding: 28rpx 32rpx calc(40rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  &__hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
  &__t { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
  &__x { font-size: 32rpx; color: $wa-muted; padding: 4rpx 8rpx; }
  &__hint { display: block; font-size: 22rpx; color: $wa-muted; line-height: 1.5; margin-bottom: 16rpx; }
  &__lbl { display: block; font-size: 24rpx; color: $wa-ink; margin: 16rpx 0 8rpx; }
  &__ops { display: flex; align-items: center; gap: 20rpx; margin-top: 28rpx; }
  &__clear { flex: none; font-size: 24rpx; color: $wa-muted; padding: 12rpx 8rpx; }
  &__save { flex: 1; margin: 0; height: 76rpx; line-height: 76rpx; background: $wa-accent;
    color: #fff; font-size: 28rpx; border-radius: $wa-radius; border: none;
    &[disabled] { opacity: .6; }
  }
  .t-warn { display: block; font-size: 24rpx; color: #fa8c16; line-height: 1.5; }
  .area { width: 100%; height: 160rpx; background: $wa-bg; border-radius: $wa-radius;
    padding: 20rpx 24rpx; font-size: 26rpx; color: $wa-ink; box-sizing: border-box; margin-top: 12rpx; }
  .ipt { height: 72rpx; background: $wa-bg; border-radius: $wa-radius; padding: 0 20rpx;
    font-size: 26rpx; color: $wa-ink; box-sizing: border-box;
    &.picker { color: $wa-muted; }
    &.picker.picked { color: $wa-ink; }
    &.wide { width: 100%; margin-bottom: 4rpx; }
  }
  .opts { display: flex; flex-direction: column; gap: 12rpx; max-height: 46vh; overflow-y: auto;
    .opt { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx;
      display: flex; align-items: center; gap: 12rpx; border: 2rpx solid transparent;
      &.on { border-color: $wa-accent; background: #fff; }
      .opt__t { flex: 1; font-size: 26rpx; color: $wa-ink; font-weight: 600; }
      .opt__s { font-size: 22rpx; color: $wa-muted; }
    }
  }
}
</style>
