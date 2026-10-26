/**
 * SPDX-FileCopyrightText: (c) 2026 Liferay, Inc. https://liferay.com
 * SPDX-License-Identifier: LGPL-2.1-or-later OR LicenseRef-Liferay-DXP-EULA-2.0.0-2023-06
 */

package com.liferay.commerce.service.test;

import com.liferay.account.constants.AccountConstants;
import com.liferay.arquillian.extension.junit.bridge.junit.Arquillian;
import com.liferay.commerce.context.CommerceContext;
import com.liferay.commerce.currency.model.CommerceCurrency;
import com.liferay.commerce.currency.test.util.CommerceCurrencyTestUtil;
import com.liferay.commerce.inventory.model.CommerceInventoryWarehouse;
import com.liferay.commerce.model.CommerceOrder;
import com.liferay.commerce.model.CommerceOrderItem;
import com.liferay.commerce.price.list.model.CommercePriceList;
import com.liferay.commerce.price.list.service.CommercePriceListLocalService;
import com.liferay.commerce.price.list.test.util.CommercePriceEntryTestUtil;
import com.liferay.commerce.product.model.CPDefinition;
import com.liferay.commerce.product.model.CPInstance;
import com.liferay.commerce.product.model.CommerceCatalog;
import com.liferay.commerce.product.model.CommerceChannel;
import com.liferay.commerce.product.service.CommerceCatalogLocalService;
import com.liferay.commerce.product.test.util.CPTestUtil;
import com.liferay.commerce.service.CommerceOrderItemService;
import com.liferay.commerce.service.CommerceOrderLocalService;
import com.liferay.commerce.test.util.CommerceInventoryTestUtil;
import com.liferay.commerce.test.util.CommerceTestUtil;
import com.liferay.commerce.test.util.context.TestCommerceContext;
import com.liferay.petra.string.StringBundler;
import com.liferay.petra.string.StringPool;
import com.liferay.portal.kernel.model.Group;
import com.liferay.portal.kernel.model.User;
import com.liferay.portal.kernel.security.auth.PrincipalException;
import com.liferay.portal.kernel.security.permission.PermissionCheckerFactoryUtil;
import com.liferay.portal.kernel.service.UserLocalService;
import com.liferay.portal.kernel.test.context.ContextUserReplace;
import com.liferay.portal.kernel.test.rule.AggregateTestRule;
import com.liferay.portal.kernel.test.util.GroupTestUtil;
import com.liferay.portal.kernel.test.util.RandomTestUtil;
import com.liferay.portal.kernel.test.util.ServiceContextTestUtil;
import com.liferay.portal.kernel.test.util.TestPropsValues;
import com.liferay.portal.kernel.util.LocaleUtil;
import com.liferay.portal.test.rule.Inject;
import com.liferay.portal.test.rule.LiferayIntegrationTestRule;
import com.liferay.portal.test.rule.PermissionCheckerMethodTestRule;

import java.math.BigDecimal;

import org.junit.Assert;
import org.junit.Before;
import org.junit.ClassRule;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * @author Stefano Motta
 */
@RunWith(Arquillian.class)
public class CommerceCartGuestIsolationTest {

	@ClassRule
	@Rule
	public static final AggregateTestRule aggregateTestRule =
		new AggregateTestRule(
			new LiferayIntegrationTestRule(),
			PermissionCheckerMethodTestRule.INSTANCE);

	@Before
	public void setUp() throws Exception {
		_group = GroupTestUtil.addGroup();

		_commerceCurrency = CommerceCurrencyTestUtil.addCommerceCurrency(
			_group.getCompanyId());

		_commerceChannel = CommerceTestUtil.addCommerceChannel(
			_group.getGroupId(), _commerceCurrency.getCode());

		CommerceCatalog commerceCatalog =
			_commerceCatalogLocalService.addCommerceCatalog(
				null, RandomTestUtil.randomString(),
				_commerceCurrency.getCode(), LocaleUtil.US.getDisplayLanguage(),
				ServiceContextTestUtil.getServiceContext(_group.getGroupId()));

		_cpInstance = CPTestUtil.addCPInstanceFromCatalog(
			commerceCatalog.getGroupId());

		CPDefinition cpDefinition = _cpInstance.getCPDefinition();

		CommercePriceList commercePriceList =
			_commercePriceListLocalService.fetchCatalogBaseCommercePriceList(
				commerceCatalog.getGroupId());

		CommercePriceEntryTestUtil.addCommercePriceEntry(
			StringPool.BLANK, cpDefinition.getCProductId(),
			_cpInstance.getCPInstanceUuid(),
			commercePriceList.getCommercePriceListId(),
			BigDecimal.valueOf(RandomTestUtil.randomInt()));

		CommerceInventoryWarehouse commerceInventoryWarehouse =
			CommerceInventoryTestUtil.addCommerceInventoryWarehouse(
				ServiceContextTestUtil.getServiceContext(_group.getGroupId()));

		CommerceTestUtil.addWarehouseCommerceChannelRel(
			commerceInventoryWarehouse.getCommerceInventoryWarehouseId(),
			_commerceChannel.getCommerceChannelId());

		CommerceInventoryTestUtil.addCommerceInventoryWarehouseItem(
			TestPropsValues.getUserId(), commerceInventoryWarehouse,
			BigDecimal.valueOf(RandomTestUtil.randomInt()),
			_cpInstance.getSku(), StringPool.BLANK);
	}

	@Test
	public void testAddOrUpdateCommerceOrderItem() throws Exception {

		// A guest cannot update another guest's cart

		CommerceOrder commerceOrder =
			_commerceOrderLocalService.addCommerceOrder(
				TestPropsValues.getUserId(), _commerceChannel.getGroupId(),
				AccountConstants.ACCOUNT_ENTRY_ID_GUEST,
				_commerceCurrency.getCode(), 0);

		User guestUser = _userLocalService.getGuestUser(_group.getCompanyId());

		try (ContextUserReplace contextUserReplace = new ContextUserReplace(
				guestUser, PermissionCheckerFactoryUtil.create(guestUser))) {

			CommerceContext commerceContext = new TestCommerceContext(
				null, _commerceCurrency, _commerceChannel, guestUser, _group,
				commerceOrder);

			try {
				CommerceOrderItem commerceOrderItem =
					_commerceOrderItemService.addOrUpdateCommerceOrderItem(
						commerceOrder.getCommerceOrderId(),
						_cpInstance.getCPInstanceId(), null, BigDecimal.ONE, 0,
						BigDecimal.ZERO, StringPool.BLANK, commerceContext,
						ServiceContextTestUtil.getServiceContext(
							_group.getGroupId()));

				Assert.fail(
					StringBundler.concat(
						"LPD-107936: a guest added order item ",
						commerceOrderItem.getCommerceOrderItemId(),
						" to another guest's cart ",
						commerceOrder.getCommerceOrderId(),
						" through CommerceCartResource, which does not verify ",
						"the order UUID that proves cart ownership"));
			}
			catch (PrincipalException principalException) {
				Assert.assertNotNull(principalException);
			}
		}
	}

	@Inject
	private CommerceCatalogLocalService _commerceCatalogLocalService;

	private CommerceChannel _commerceChannel;
	private CommerceCurrency _commerceCurrency;

	@Inject
	private CommerceOrderItemService _commerceOrderItemService;

	@Inject
	private CommerceOrderLocalService _commerceOrderLocalService;

	@Inject
	private CommercePriceListLocalService _commercePriceListLocalService;

	private CPInstance _cpInstance;
	private Group _group;

	@Inject
	private UserLocalService _userLocalService;

}